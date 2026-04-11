export const ROLES = {
  USER: "user",
  ADMIN: "admin",
  SUPER_ADMIN: "super_admin",
  OWNER: "owner",
} as const;

export type RoleName = (typeof ROLES)[keyof typeof ROLES];
