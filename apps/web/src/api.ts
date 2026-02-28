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
} from "./types";

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
    throw new Error(payload.message || payload.error || `HTTP ${response.status}`);
  }

  return payload as T;
}

export const api = {
  authMode: () => fetchJson<AuthModeResponse>("/v1/auth/mode"),
  ssoSession: () => fetchJson<{ authenticated: boolean; token: string | null; user: User | null }>("/v1/auth/sso/session"),
  me: (token: string) => fetchJson<{ user: User | null }>("/v1/auth/me", token),
  wsTicket: (token: string) => fetchJson<{ ticket: string; expiresInSec: number }>("/v1/auth/ws-ticket", token),
  rooms: (token: string) => fetchJson<{ rooms: Room[] }>("/v1/rooms", token),
  roomTree: (token: string) => fetchJson<RoomsTreeResponse>("/v1/rooms/tree", token),
  createCategory: (token: string, input: { slug: string; title: string; position?: number }) =>
    fetchJson<{ category: RoomCategory }>("/v1/room-categories", token, {
      method: "POST",
      body: JSON.stringify(input)
    }),
  updateCategory: (token: string, categoryId: string, input: { title: string }) =>
    fetchJson<{ category: RoomCategory }>(`/v1/room-categories/${encodeURIComponent(categoryId)}`, token, {
      method: "PATCH",
      body: JSON.stringify(input)
    }),
  moveCategory: (token: string, categoryId: string, direction: "up" | "down") =>
    fetchJson<{ category: RoomCategory }>(`/v1/room-categories/${encodeURIComponent(categoryId)}/move`, token, {
      method: "POST",
      body: JSON.stringify({ direction })
    }),
  createRoom: (
    token: string,
    input: { slug: string; title: string; is_public: boolean; kind?: RoomKind; category_id?: string | null }
  ) =>
    fetchJson<{ room: Room }>("/v1/rooms", token, { method: "POST", body: JSON.stringify(input) }),
  updateRoom: (
    token: string,
    roomId: string,
    input: { title: string; kind: RoomKind; category_id: string | null }
  ) =>
    fetchJson<{ room: Room }>(`/v1/rooms/${encodeURIComponent(roomId)}`, token, {
      method: "PATCH",
      body: JSON.stringify(input)
    }),
  moveRoom: (token: string, roomId: string, direction: "up" | "down") =>
    fetchJson<{ room: Room }>(`/v1/rooms/${encodeURIComponent(roomId)}/move`, token, {
      method: "POST",
      body: JSON.stringify({ direction })
    }),
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
      `/v1/rooms/${encodeURIComponent(slug)}/messages?${params.toString()}`,
      token
    );
  },
  telemetrySummary: (token: string) => fetchJson<TelemetrySummary>("/v1/telemetry/summary", token),
  adminUsers: (token: string) => fetchJson<{ users: User[] }>("/v1/admin/users", token),
  promoteUser: (token: string, userId: string) =>
    fetchJson<{ user: User }>(`/v1/admin/users/${encodeURIComponent(userId)}/promote`, token, {
      method: "POST",
      body: JSON.stringify({ role: "admin" })
    })
};
