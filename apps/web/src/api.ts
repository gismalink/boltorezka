import type {
  AuthModeResponse,
  MessagesCursor,
  RoomCategory,
  Room,
  RoomKind,
  RoomMessagesResponse,
  RoomsTreeResponse,
  TelemetrySummary,
  User
} from "./domain";

type ApiErrorPayload = {
  message?: string;
  error?: string;
  [key: string]: unknown;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly payload: ApiErrorPayload;

  constructor(status: number, payload: ApiErrorPayload) {
    super(String(payload.message || payload.error || `HTTP ${status}`));
    this.name = "ApiError";
    this.status = status;
    this.code = String(payload.error || "HTTP_ERROR");
    this.payload = payload;
  }
}

async function fetchJson<T>(path: string, token?: string, init: RequestInit = {}) {
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined)
  };

  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  if (!headers["content-type"] && init.body) {
    headers["content-type"] = "application/json";
  }

  const response = await fetch(path, { ...init, headers });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(response.status, payload as ApiErrorPayload);
  }

  return payload as T;
}

const endpoints = {
  authMode: "/v1/auth/mode",
  ssoSession: "/v1/auth/sso/session",
  me: "/v1/auth/me",
  wsTicket: "/v1/auth/ws-ticket",
  rooms: "/v1/rooms",
  roomsTree: "/v1/rooms/tree",
  roomCategories: "/v1/room-categories",
  telemetrySummary: "/v1/telemetry/summary",
  adminUsers: "/v1/admin/users"
} as const;

const withId = (basePath: string, id: string) => `${basePath}/${encodeURIComponent(id)}`;
const withSuffix = (basePath: string, id: string, suffix: string) => `${withId(basePath, id)}/${suffix}`;

const withJsonBody = (method: "POST" | "PATCH" | "DELETE", body?: unknown): RequestInit => ({
  method,
  ...(typeof body === "undefined" ? {} : { body: JSON.stringify(body) })
});

export const api = {
  authMode: () => fetchJson<AuthModeResponse>(endpoints.authMode),
  ssoSession: () => fetchJson<{ authenticated: boolean; token: string | null; user: User | null }>(endpoints.ssoSession),
  me: (token: string) => fetchJson<{ user: User | null }>(endpoints.me, token),
  updateMe: (token: string, input: { name: string }) =>
    fetchJson<{ user: User | null }>(endpoints.me, token, withJsonBody("PATCH", input)),
  wsTicket: (token: string) => fetchJson<{ ticket: string; expiresInSec: number }>(endpoints.wsTicket, token),
  rooms: (token: string) => fetchJson<{ rooms: Room[] }>(endpoints.rooms, token),
  roomTree: (token: string) => fetchJson<RoomsTreeResponse>(endpoints.roomsTree, token),
  createCategory: (token: string, input: { slug: string; title: string; position?: number }) =>
    fetchJson<{ category: RoomCategory }>(endpoints.roomCategories, token, withJsonBody("POST", input)),
  updateCategory: (token: string, categoryId: string, input: { title: string }) =>
    fetchJson<{ category: RoomCategory }>(withId(endpoints.roomCategories, categoryId), token, withJsonBody("PATCH", input)),
  moveCategory: (token: string, categoryId: string, direction: "up" | "down") =>
    fetchJson<{ category: RoomCategory }>(withSuffix(endpoints.roomCategories, categoryId, "move"), token, withJsonBody("POST", { direction })),
  deleteCategory: (token: string, categoryId: string) =>
    fetchJson<{ ok: true; categoryId: string }>(withId(endpoints.roomCategories, categoryId), token, withJsonBody("DELETE")),
  createRoom: (
    token: string,
    input: { slug: string; title: string; is_public: boolean; kind?: RoomKind; category_id?: string | null }
  ) =>
    fetchJson<{ room: Room }>(endpoints.rooms, token, withJsonBody("POST", input)),
  updateRoom: (
    token: string,
    roomId: string,
    input: { title: string; kind: RoomKind; category_id: string | null }
  ) =>
    fetchJson<{ room: Room }>(withId(endpoints.rooms, roomId), token, withJsonBody("PATCH", input)),
  moveRoom: (token: string, roomId: string, direction: "up" | "down") =>
    fetchJson<{ room: Room }>(withSuffix(endpoints.rooms, roomId, "move"), token, withJsonBody("POST", { direction })),
  deleteRoom: (token: string, roomId: string) =>
    fetchJson<{ ok: true; roomId: string; archived?: boolean }>(withId(endpoints.rooms, roomId), token, withJsonBody("DELETE")),
  clearRoomMessages: (token: string, roomId: string) =>
    fetchJson<{ ok: true; roomId: string; deletedCount: number }>(withSuffix(endpoints.rooms, roomId, "messages"), token, withJsonBody("DELETE")),
  roomMessages: (
    token: string,
    slug: string,
    options: { limit?: number; cursor?: MessagesCursor | null } = {}
  ) => {
    const params = new URLSearchParams();
    params.set("limit", String(options.limit ?? 50));

    if (options.cursor?.beforeCreatedAt && options.cursor?.beforeId) {
      params.set("beforeCreatedAt", options.cursor.beforeCreatedAt);
      params.set("beforeId", options.cursor.beforeId);
    }

    return fetchJson<RoomMessagesResponse>(
      `${withSuffix(endpoints.rooms, slug, "messages")}?${params.toString()}`,
      token
    );
  },
  telemetrySummary: (token: string) => fetchJson<TelemetrySummary>(endpoints.telemetrySummary, token),
  adminUsers: (token: string) => fetchJson<{ users: User[] }>(endpoints.adminUsers, token),
  promoteUser: (token: string, userId: string) =>
    fetchJson<{ user: User }>(withSuffix(endpoints.adminUsers, userId, "promote"), token, withJsonBody("POST", { role: "admin" })),
  demoteUser: (token: string, userId: string) =>
    fetchJson<{ user: User }>(withSuffix(endpoints.adminUsers, userId, "demote"), token, withJsonBody("POST", { role: "user" })),
  banUser: (token: string, userId: string) =>
    fetchJson<{ user: User }>(withSuffix(endpoints.adminUsers, userId, "ban"), token, withJsonBody("POST")),
  unbanUser: (token: string, userId: string) =>
    fetchJson<{ user: User }>(withSuffix(endpoints.adminUsers, userId, "unban"), token, withJsonBody("POST"))
};
