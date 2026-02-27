import type { AuthModeResponse, Message, Room, User } from "./types";

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
  createRoom: (token: string, input: { slug: string; title: string; is_public: boolean }) =>
    fetchJson<{ room: Room }>("/v1/rooms", token, { method: "POST", body: JSON.stringify(input) }),
  roomMessages: (token: string, slug: string) =>
    fetchJson<{ room: Room; messages: Message[] }>(`/v1/rooms/${encodeURIComponent(slug)}/messages?limit=50`, token),
  adminUsers: (token: string) => fetchJson<{ users: User[] }>("/v1/admin/users", token),
  promoteUser: (token: string, userId: string) =>
    fetchJson<{ user: User }>(`/v1/admin/users/${encodeURIComponent(userId)}/promote`, token, {
      method: "POST",
      body: JSON.stringify({ role: "admin" })
    })
};
