CREATE TABLE IF NOT EXISTS servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  owner_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT servers_name_length_check CHECK (char_length(trim(name)) BETWEEN 3 AND 64)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_servers_single_default
  ON servers ((is_default))
  WHERE is_default = TRUE;

CREATE TABLE IF NOT EXISTS server_members (
  server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (server_id, user_id),
  CONSTRAINT server_members_role_check CHECK (role IN ('owner', 'admin', 'member')),
  CONSTRAINT server_members_status_check CHECK (status IN ('active', 'invited', 'left', 'removed'))
);

CREATE INDEX IF NOT EXISTS idx_server_members_user_id ON server_members(user_id);

CREATE TABLE IF NOT EXISTS server_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ,
  max_uses INTEGER,
  used_count INTEGER NOT NULL DEFAULT 0,
  is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT server_invites_max_uses_check CHECK (max_uses IS NULL OR max_uses > 0),
  CONSTRAINT server_invites_used_count_check CHECK (used_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_server_invites_server_id ON server_invites(server_id);
CREATE INDEX IF NOT EXISTS idx_server_invites_expires_at ON server_invites(expires_at);

CREATE TABLE IF NOT EXISTS server_bans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT,
  banned_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (server_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_server_bans_server_id ON server_bans(server_id);

CREATE TABLE IF NOT EXISTS service_bans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT,
  banned_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'rooms'
      AND column_name = 'server_id'
  ) THEN
    ALTER TABLE rooms ADD COLUMN server_id UUID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'rooms'
      AND column_name = 'nsfw'
  ) THEN
    ALTER TABLE rooms ADD COLUMN nsfw BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;

WITH owner_candidate AS (
  SELECT COALESCE(
    (SELECT id FROM users WHERE lower(email) = 'gismalink@gmail.com' LIMIT 1),
    (SELECT id FROM users WHERE role IN ('super_admin', 'admin') ORDER BY created_at ASC LIMIT 1),
    (SELECT id FROM users ORDER BY created_at ASC LIMIT 1)
  ) AS owner_user_id
)
INSERT INTO servers (slug, name, owner_user_id, is_default)
SELECT 'bossserver', 'BossServer', owner_user_id, TRUE
FROM owner_candidate
WHERE owner_user_id IS NOT NULL
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  owner_user_id = COALESCE(servers.owner_user_id, EXCLUDED.owner_user_id),
  is_default = TRUE,
  updated_at = NOW();

UPDATE servers
SET is_default = FALSE
WHERE is_default = TRUE
  AND slug <> 'bossserver';

UPDATE rooms
SET server_id = s.id
FROM servers s
WHERE s.slug = 'bossserver'
  AND rooms.server_id IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'rooms'
      AND column_name = 'server_id'
      AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE rooms ALTER COLUMN server_id SET NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'rooms_server_id_fkey'
  ) THEN
    ALTER TABLE rooms
      ADD CONSTRAINT rooms_server_id_fkey
      FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_rooms_server_id ON rooms(server_id);
CREATE INDEX IF NOT EXISTS idx_rooms_server_category_position ON rooms(server_id, category_id, position);
CREATE INDEX IF NOT EXISTS idx_rooms_server_nsfw ON rooms(server_id, nsfw);

INSERT INTO server_members (server_id, user_id, role, status)
SELECT s.id, s.owner_user_id, 'owner', 'active'
FROM servers s
WHERE s.slug = 'bossserver'
  AND s.owner_user_id IS NOT NULL
ON CONFLICT (server_id, user_id) DO UPDATE SET
  role = 'owner',
  status = 'active';

INSERT INTO server_members (server_id, user_id, role, status)
SELECT s.id, u.id, 'member', 'active'
FROM servers s
JOIN users u ON TRUE
WHERE s.slug = 'bossserver'
  AND u.is_bot = FALSE
  AND u.access_state = 'active'
ON CONFLICT (server_id, user_id) DO NOTHING;
