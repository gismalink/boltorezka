import { db } from "../db.js";
import { config } from "../config.js";
import type { UserRow } from "../db.types.ts";

export async function upsertSsoUser(profile: Record<string, unknown> | null | undefined): Promise<UserRow> {
  const normalizedEmail = String(profile?.email || "")
    .trim()
    .toLowerCase();

  if (!normalizedEmail) {
    throw new Error("SSO profile does not contain email");
  }

  const emailLocalPart = normalizedEmail.split("@")[0] || "";
  const normalizedUsername = emailLocalPart || null;
  const displayName = emailLocalPart || "SSO User";
  const isSuperAdmin = normalizedEmail === config.superAdminEmail;
  const isSmokeRtcBot = /^smoke-rtc-\d+@example\.test$/.test(normalizedEmail);
  const isPrimarySmokeAdmin = normalizedEmail === "smoke-rtc-1@example.test";
  const shouldForceActiveAccess = isSuperAdmin || isSmokeRtcBot;
  const existing = await db.query<UserRow>(
    "SELECT id, email, username, name, ui_theme, role, is_banned, access_state, is_bot, deleted_at, purge_scheduled_at, created_at FROM users WHERE email = $1",
    [normalizedEmail]
  );

  if ((existing.rowCount || 0) > 0) {
    const updated = await db.query<UserRow>(
      `UPDATE users
       SET
         username = COALESCE(username, $4),
         name = CASE
           WHEN name IS NULL OR BTRIM(name) = '' THEN $2
           ELSE name
         END,
         role = CASE
           WHEN $3 THEN 'super_admin'
           WHEN $7 THEN 'admin'
           ELSE role
         END,
         access_state = CASE WHEN $6 THEN 'active' ELSE access_state END,
         is_bot = CASE WHEN $5 THEN TRUE ELSE is_bot END
       WHERE email = $1
      RETURNING id, email, username, name, ui_theme, role, is_banned, access_state, is_bot, deleted_at, purge_scheduled_at, created_at`,
      [
        normalizedEmail,
        displayName,
        isSuperAdmin,
        normalizedUsername,
        isSmokeRtcBot,
        shouldForceActiveAccess,
        isPrimarySmokeAdmin
      ]
    );

    return updated.rows[0];
  }

  const newRole = isSuperAdmin ? "super_admin" : isPrimarySmokeAdmin ? "admin" : "user";

  const created = await db.query<UserRow>(
    `INSERT INTO users (email, password_hash, username, name, role, access_state, is_bot)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id, email, username, name, ui_theme, role, is_banned, access_state, is_bot, deleted_at, purge_scheduled_at, created_at`,
    [
      normalizedEmail,
      "__sso_only__",
      normalizedUsername,
      displayName,
      newRole,
      shouldForceActiveAccess ? "active" : "pending",
      isSmokeRtcBot
    ]
  );

  return created.rows[0];
}