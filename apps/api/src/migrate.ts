import { db } from "./db.js";
import { runMigrations } from "./migrations.js";

try {
  await runMigrations();
  console.log("Migrations completed successfully");
  await db.end();
  process.exit(0);
} catch (error: unknown) {
  console.error("Migration failed", error);
  await db.end();
  process.exit(1);
}
