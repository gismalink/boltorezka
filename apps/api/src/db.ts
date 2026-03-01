import pg from "pg";
import { config } from "./config.js";

const { Pool } = pg;

export const db = new Pool({
  connectionString: config.databaseUrl,
  max: 20
});

export async function dbHealthcheck() {
  await db.query("SELECT 1");
}

export async function ensureSchema() {
  await db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'");
  await db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT FALSE");
  await db.query(
    `CREATE TABLE IF NOT EXISTS room_categories (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`
  );
  await db.query("ALTER TABLE rooms ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'text'");
  await db.query("UPDATE rooms SET kind = 'text_voice' WHERE kind = 'voice'");
  await db.query("UPDATE rooms SET kind = 'text' WHERE kind NOT IN ('text', 'text_voice', 'text_voice_video')");
  await db.query("ALTER TABLE rooms DROP CONSTRAINT IF EXISTS rooms_kind_check");
  await db.query(
    "ALTER TABLE rooms ADD CONSTRAINT rooms_kind_check CHECK (kind IN ('text', 'text_voice', 'text_voice_video'))"
  );
  await db.query("ALTER TABLE rooms ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES room_categories(id) ON DELETE SET NULL");
  await db.query("ALTER TABLE rooms ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0");
  await db.query("ALTER TABLE rooms ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE");
  await db.query("CREATE INDEX IF NOT EXISTS idx_rooms_category_position ON rooms(category_id, position)");
  await db.query("CREATE INDEX IF NOT EXISTS idx_rooms_archived ON rooms(is_archived)");
}
