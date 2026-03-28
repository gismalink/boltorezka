DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'servers'
      AND column_name = 'is_blocked'
  ) THEN
    ALTER TABLE servers
      ADD COLUMN is_blocked BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_servers_is_blocked_created_at
  ON servers (is_blocked, created_at);
