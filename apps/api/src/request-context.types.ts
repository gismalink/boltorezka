import type { UserRow } from "./db.types.ts";

export type JwtUser = {
  sub?: string;
  email?: string;
  name?: string;
  role?: string;
};

export type AuthenticatedRequestContext = {
  user?: JwtUser;
  currentUser?: UserRow;
};

export type RoomMessagesRequestContext = AuthenticatedRequestContext & {
  params?: { slug?: string };
  query?: { limit?: string | number };
};

export type AuthStartRequestContext = {
  query?: { provider?: string; returnUrl?: string };
  headers: Record<string, string | string[] | undefined>;
};

export type PromoteRequestContext = AuthenticatedRequestContext & {
  params?: { userId?: string };
  body?: {
    role?: "admin";
  };
};
