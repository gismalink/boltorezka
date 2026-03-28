ALTER TABLE room_categories
  ADD COLUMN IF NOT EXISTS server_id UUID;

WITH fallback AS (
  SELECT
    (SELECT id FROM servers WHERE is_default = TRUE ORDER BY created_at ASC LIMIT 1) AS default_server_id,
    (SELECT id FROM servers ORDER BY created_at ASC LIMIT 1) AS first_server_id
)
UPDATE room_categories rc
SET server_id = COALESCE(
  (
    SELECT r.server_id
    FROM rooms r
    WHERE r.category_id = rc.id
      AND r.server_id IS NOT NULL
    ORDER BY r.created_at ASC
    LIMIT 1
  ),
  (
    SELECT sm.server_id
    FROM server_members sm
    JOIN servers s ON s.id = sm.server_id
    WHERE sm.user_id = rc.created_by
      AND sm.status = 'active'
      AND s.is_archived = FALSE
    ORDER BY s.is_default DESC, sm.created_at ASC
    LIMIT 1
  ),
  (SELECT default_server_id FROM fallback),
  (SELECT first_server_id FROM fallback)
)
WHERE rc.server_id IS NULL;

ALTER TABLE room_categories
  ALTER COLUMN server_id SET NOT NULL;

ALTER TABLE room_categories
  DROP CONSTRAINT IF EXISTS room_categories_slug_key;

ALTER TABLE room_categories
  ADD CONSTRAINT room_categories_server_id_fkey
    FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE;

ALTER TABLE room_categories
  ADD CONSTRAINT room_categories_server_slug_key UNIQUE (server_id, slug);

CREATE INDEX IF NOT EXISTS idx_room_categories_server ON room_categories(server_id);
