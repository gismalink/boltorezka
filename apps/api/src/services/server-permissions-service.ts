import { db } from "../db.js";
import type { ServerMemberRole, UserRole } from "../db.types.ts";

export type ServerScopedPermissionKey =
  | "manageRooms"
  | "manageTopics"
  | "moderateMembers"
  | "manageInvites"
  | "manageRoles"
  | "viewModerationAudit"
  | "manageServer";

export type ServerScopedPermissions = Record<ServerScopedPermissionKey, boolean>;

const emptyPermissions = (): ServerScopedPermissions => ({
  manageRooms: false,
  manageTopics: false,
  moderateMembers: false,
  manageInvites: false,
  manageRoles: false,
  viewModerationAudit: false,
  manageServer: false
});

function mergePermissions(target: ServerScopedPermissions, patch: Partial<ServerScopedPermissions>) {
  (Object.keys(target) as ServerScopedPermissionKey[]).forEach((key) => {
    if (patch[key]) {
      target[key] = true;
    }
  });
}

async function resolveGlobalRole(userId: string): Promise<UserRole> {
  const result = await db.query<{ role: UserRole }>(
    `SELECT role
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [userId]
  );

  return result.rows[0]?.role || "user";
}

async function resolveServerRole(serverId: string, userId: string): Promise<ServerMemberRole> {
  const membership = await db.query<{ role: ServerMemberRole }>(
    `SELECT role
     FROM server_members
     WHERE server_id = $1
       AND user_id = $2
       AND status = 'active'
     LIMIT 1`,
    [serverId, userId]
  );

  return membership.rows[0]?.role || "member";
}

async function resolveMemberCustomRoles(serverId: string, userId: string): Promise<Array<{ id: string; name: string }>> {
  const customRoles = await db.query<{ id: string; name: string }>(
    `SELECT scr.id, scr.name
     FROM server_member_custom_roles smcr
     JOIN server_custom_roles scr ON scr.id = smcr.role_id
     WHERE smcr.server_id = $1
       AND smcr.user_id = $2
     ORDER BY scr.name ASC`,
    [serverId, userId]
  );

  return customRoles.rows;
}

export async function resolveEffectiveServerPermissions(input: {
  serverId: string;
  userId: string;
  globalRole?: UserRole;
  serverRole?: ServerMemberRole;
}) {
  const globalRole = input.globalRole || await resolveGlobalRole(input.userId);
  const serverRole = input.serverRole || await resolveServerRole(input.serverId, input.userId);

  const permissions = emptyPermissions();

  const isGlobalAdmin = globalRole === "admin" || globalRole === "super_admin";
  const isServerAdmin = serverRole === "owner" || serverRole === "admin";

  if (isGlobalAdmin || isServerAdmin) {
    mergePermissions(permissions, {
      manageRooms: true,
      manageTopics: true,
      moderateMembers: true,
      manageInvites: true,
      manageRoles: true,
      viewModerationAudit: true,
      manageServer: true
    });
  }

  const customRoles = await resolveMemberCustomRoles(input.serverId, input.userId);

  return {
    globalRole,
    serverRole,
    customRoles,
    permissions,
    isGlobalAdmin,
    isSuperAdmin: globalRole === "super_admin"
  };
}
