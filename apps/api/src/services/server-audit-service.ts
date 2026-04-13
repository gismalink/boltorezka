import type { PoolClient } from "pg";
import { db } from "../db.js";
import { normalizeBoundedString } from "../validators.js";

type AuditPayload = Record<string, unknown>;

type WriteServerAuditEventInput = {
  action: string;
  serverId?: string | null;
  actorUserId?: string | null;
  targetUserId?: string | null;
  meta?: AuditPayload;
  client?: PoolClient;
};

export async function writeServerAuditEvent(input: WriteServerAuditEventInput): Promise<void> {
  const action = normalizeBoundedString(input.action, 128) || "";
  if (!action) {
    return;
  }

  const queryable = input.client || db;
  await queryable.query(
    `INSERT INTO server_audit_logs (server_id, actor_user_id, target_user_id, action, meta)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [
      input.serverId || null,
      input.actorUserId || null,
      input.targetUserId || null,
      action.slice(0, 128),
      JSON.stringify(input.meta || {})
    ]
  );
}
