import type { RoomListRow, RoomMessageRow, RoomRow, UserRow } from "./db.types.ts";

export type AuthModeResponse = {
  mode: string;
  ssoBaseUrl: string;
};

export type SsoSessionResponse = {
  authenticated: boolean;
  user: UserRow | null;
  token: string | null;
  sso?: {
    id: string | null;
    email: string | null;
    username: string | null;
    role: string;
  };
};

export type WsTicketResponse = {
  ticket: string;
  expiresInSec: number;
};

export type MeResponse = {
  user: UserRow | null;
};

export type RoomsListResponse = {
  rooms: RoomListRow[];
};

export type RoomCreateResponse = {
  room: RoomRow;
};

export type RoomMessagesResponse = {
  room: RoomRow;
  messages: RoomMessageRow[];
  pagination: {
    hasMore: boolean;
    nextCursor: {
      beforeCreatedAt: string;
      beforeId: string;
    } | null;
  };
};

export type AdminUsersResponse = {
  users: UserRow[];
};

export type PromoteUserResponse = {
  user: UserRow;
};
