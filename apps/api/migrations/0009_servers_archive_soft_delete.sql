DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'servers'
      AND column_name = 'is_archived'
  ) THEN
    ALTER TABLE servers
      ADD COLUMN is_archived BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_servers_is_archived_created_at
  ON servers (is_archived, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_servers_single_default_active
  ON servers ((is_default))
  WHERE is_default = TRUE AND is_archived = FALSE;
