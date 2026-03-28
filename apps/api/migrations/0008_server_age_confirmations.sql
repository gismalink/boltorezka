CREATE TABLE IF NOT EXISTS server_age_confirmations (
  server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source TEXT,
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (server_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_server_age_confirmations_user_id
  ON server_age_confirmations(user_id);

CREATE INDEX IF NOT EXISTS idx_server_age_confirmations_confirmed_at
  ON server_age_confirmations(confirmed_at DESC);
