import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PoolClient } from "pg";
import { db } from "./db.js";

type MigrationFile = {
  version: string;
  name: string;
  filePath: string;
};

const MIGRATION_FILE_PATTERN = /^(\d+)_(.+)\.sql$/;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "../migrations");

async function ensureMigrationsTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getAppliedMigrationVersions() {
  const result = await db.query<{ version: string }>("SELECT version FROM schema_migrations");
  return new Set(result.rows.map((row) => row.version));
}

async function loadMigrationFiles(): Promise<MigrationFile[]> {
  const entries = await readdir(MIGRATIONS_DIR, { withFileTypes: true });

  const migrationFiles = entries
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const match = entry.name.match(MIGRATION_FILE_PATTERN);
      if (!match) {
        return null;
      }

      const [, version, name] = match;
      return {
        version,
        name,
        filePath: path.join(MIGRATIONS_DIR, entry.name)
      };
    })
    .filter((item): item is MigrationFile => item !== null)
    .sort((a, b) => Number(a.version) - Number(b.version));

  const seenVersions = new Set<string>();
  for (const migration of migrationFiles) {
    if (seenVersions.has(migration.version)) {
      throw new Error(`Duplicate migration version detected: ${migration.version}`);
    }
    seenVersions.add(migration.version);
  }

  return migrationFiles;
}

async function applyMigration(client: PoolClient, migration: MigrationFile) {
  const sql = await readFile(migration.filePath, "utf8");

  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query(
      "INSERT INTO schema_migrations (version, name) VALUES ($1, $2)",
      [migration.version, migration.name]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export async function runMigrations() {
  await ensureMigrationsTable();

  const [migrationFiles, appliedVersions] = await Promise.all([
    loadMigrationFiles(),
    getAppliedMigrationVersions()
  ]);

  const pendingMigrations = migrationFiles.filter((migration) => !appliedVersions.has(migration.version));

  if (pendingMigrations.length === 0) {
    return;
  }

  const client = await db.connect();
  try {
    for (const migration of pendingMigrations) {
      await applyMigration(client, migration);
    }
  } finally {
    client.release();
  }
}
