import { db } from "../db.js";
import { writeServerAuditEvent } from "./server-audit-service.js";

type ConfirmServerAgeInput = {
  serverId: string;
  userId: string;
  source?: string | null;
};

type ServerAgeConfirmation = {
  serverId: string;
  userId: string;
  confirmedAt: string;
};

function normalizeSource(source?: string | null): string | null {
  const value = String(source || "").trim();
  return value ? value.slice(0, 64) : null;
}

export async function getServerAgeConfirmation(serverId: string, userId: string): Promise<ServerAgeConfirmation | null> {
  const result = await db.query<{ server_id: string; user_id: string; confirmed_at: string }>(
    `SELECT server_id, user_id, confirmed_at
     FROM server_age_confirmations
     WHERE server_id = $1
       AND user_id = $2
     LIMIT 1`,
    [serverId, userId]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    serverId: row.server_id,
    userId: row.user_id,
    confirmedAt: row.confirmed_at
  };
}

export async function isServerAgeConfirmed(serverId: string, userId: string): Promise<boolean> {
  const result = await db.query<{ ok: number }>(
    `SELECT 1 AS ok
     FROM server_age_confirmations
     WHERE server_id = $1
       AND user_id = $2
     LIMIT 1`,
    [serverId, userId]
  );

  return (result.rowCount || 0) > 0;
}

export async function confirmServerAge(input: ConfirmServerAgeInput): Promise<ServerAgeConfirmation> {
  const source = normalizeSource(input.source);

  const result = await db.query<{ server_id: string; user_id: string; confirmed_at: string }>(
    `INSERT INTO server_age_confirmations (server_id, user_id, source, confirmed_at, updated_at)
     VALUES ($1, $2, $3, NOW(), NOW())
     ON CONFLICT (server_id, user_id)
     DO UPDATE SET
       source = COALESCE(EXCLUDED.source, server_age_confirmations.source),
       confirmed_at = server_age_confirmations.confirmed_at,
       updated_at = NOW()
     RETURNING server_id, user_id, confirmed_at`,
    [input.serverId, input.userId, source]
  );

  const row = result.rows[0];

  await writeServerAuditEvent({
    action: "server.age_confirmed",
    serverId: input.serverId,
    actorUserId: input.userId,
    targetUserId: input.userId,
    meta: {
      source
    }
  });

  return {
    serverId: row.server_id,
    userId: row.user_id,
    confirmedAt: row.confirmed_at
  };
}
