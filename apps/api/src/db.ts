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
