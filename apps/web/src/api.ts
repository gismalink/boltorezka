import type {
  AudioQuality,
  AuthModeResponse,
  MessagesCursor,
  LivekitTokenResponse,
  RoomCategory,
  Room,
  RoomKind,
  RoomMessagesResponse,
  RoomsTreeResponse,
  ServerAudioQualityResponse,
  ServerChatImagePolicyResponse,
  TelemetrySummary,
  ServerListItem,
  User,
  RoomMemberPreference
} from "./domain";
import { resolveApiBase } from "./transportRuntime";

type ApiErrorPayload = {
  message?: string;
  error?: string;
  issues?: {
    formErrors?: string[];
    fieldErrors?: Record<string, string[] | undefined>;
  };
  [key: string]: unknown;
};

export type ChatUploadInitResponse = {
  uploadId: string;
  storageKey: string;
  uploadUrl: string;
  method: "PUT";
  expiresInSec: number;
  requiredHeaders: Record<string, string>;
};

export type ChatUploadFinalizeResponse = {
  message: RoomMessagesResponse["messages"][number];
  attachment: {
    id: string;
    message_id: string;
    type: "image";
    storage_key: string;
    download_url: string | null;
    mime_type: string;
    size_bytes: number;
    width: number | null;
    height: number | null;
    checksum: string | null;
    created_at: string;
  };
};

const CONFIGURED_API_ORIGIN = resolveApiBase();

function withConfiguredApiOrigin(path: string): string {
  if (!CONFIGURED_API_ORIGIN) {
    return path;
  }
  if (!path.startsWith("/")) {
    return path;
  }
  return `${CONFIGURED_API_ORIGIN}${path}`;
}

const firstValidationIssue = (payload: ApiErrorPayload): string | null => {
  const formErrors = Array.isArray(payload.issues?.formErrors)
    ? payload.issues?.formErrors
    : [];
  const firstFormError = formErrors.find((item) => typeof item === "string" && item.trim().length > 0);
  if (firstFormError) {
    return firstFormError;
  }

  const fieldErrors = payload.issues?.fieldErrors || {};
  for (const [field, errors] of Object.entries(fieldErrors)) {
    if (!Array.isArray(errors) || errors.length === 0) {
      continue;
    }

    const firstFieldError = errors.find((item) => typeof item === "string" && item.trim().length > 0);
    if (firstFieldError) {
      return `${field}: ${firstFieldError}`;
    }
  }

  return null;
};

const resolveApiErrorMessage = (status: number, payload: ApiErrorPayload): string => {
  const explicitMessage = String(payload.message || "").trim();
  if (explicitMessage) {
    return explicitMessage;
  }

  const validationMessage = firstValidationIssue(payload);
  if (validationMessage) {
    return validationMessage;
  }

  const codeMessage = String(payload.error || "").trim();
  if (codeMessage) {
    return codeMessage;
  }

  return `HTTP ${status}`;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly payload: ApiErrorPayload;

  constructor(status: number, payload: ApiErrorPayload) {
    super(resolveApiErrorMessage(status, payload));
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

  const response = await fetch(withConfiguredApiOrigin(path), {
    credentials: "include",
    ...init,
    headers
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(response.status, payload as ApiErrorPayload);
  }

  return payload as T;
}

const endpoints = {
  version: "/version",
  authMode: "/v1/auth/mode",
  ssoSession: "/v1/auth/sso/session",
  authRefresh: "/v1/auth/refresh",
  authLogout: "/v1/auth/logout",
  authDesktopHandoff: "/v1/auth/desktop-handoff",
  authDesktopHandoffAttempt: "/v1/auth/desktop-handoff/attempt",
  authDesktopHandoffExchange: "/v1/auth/desktop-handoff/exchange",
  authDesktopHandoffComplete: "/v1/auth/desktop-handoff/complete",
  me: "/v1/auth/me",
  wsTicket: "/v1/auth/ws-ticket",
  livekitToken: "/v1/auth/livekit-token",
  rooms: "/v1/rooms",
  roomsArchived: "/v1/rooms/archived",
  roomsTree: "/v1/rooms/tree",
  roomCategories: "/v1/room-categories",
  telemetrySummary: "/v1/telemetry/summary",
  servers: "/v1/servers",
  adminUsers: "/v1/admin/users",
  adminServerAudioQuality: "/v1/admin/server/audio-quality",
  adminServerChatImagePolicy: "/v1/admin/server/chat-image-policy",
  memberPreferences: "/v1/member-preferences",
  chatUploadInit: "/v1/chat/uploads/init",
  chatUploadFinalize: "/v1/chat/uploads/finalize"
} as const;

const withId = (basePath: string, id: string) => `${basePath}/${encodeURIComponent(id)}`;
const withSuffix = (basePath: string, id: string, suffix: string) => `${withId(basePath, id)}/${suffix}`;

const withJsonBody = (method: "POST" | "PUT" | "PATCH" | "DELETE", body?: unknown): RequestInit => ({
  method,
  ...(typeof body === "undefined" ? {} : { body: JSON.stringify(body) })
});

async function uploadBinary(path: string, body: Blob, headers: Record<string, string>) {
  const response = await fetch(withConfiguredApiOrigin(path), {
    method: "PUT",
    credentials: "include",
    headers,
    body
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new ApiError(response.status, payload as ApiErrorPayload);
  }
}

export const api = {
  version: () => fetchJson<{ appVersion: string; appBuildSha: string; ts: string }>(
    endpoints.version,
    undefined,
    {
      cache: "no-store",
      headers: {
        "cache-control": "no-cache"
      }
    }
  ),
  authMode: () => fetchJson<AuthModeResponse>(endpoints.authMode),
  ssoSession: () => fetchJson<{ authenticated: boolean; token: string | null; user: User | null }>(endpoints.ssoSession),
  authRefresh: (token: string) => fetchJson<{ token: string; user: User | null }>(endpoints.authRefresh, token, withJsonBody("POST")),
  authLogout: (token: string) => fetchJson<{ ok: true }>(endpoints.authLogout, token, withJsonBody("POST")),
  desktopHandoffAttemptCreate: (token: string) =>
    fetchJson<{ ok: true; attemptId: string; expiresInSec: number }>(
      endpoints.authDesktopHandoffAttempt,
      token,
      withJsonBody("POST")
    ),
  desktopHandoffAttemptStatus: (token: string, attemptId: string) =>
    fetchJson<{ status: "pending" | "completed" | "expired" }>(
      `${endpoints.authDesktopHandoffAttempt}/${encodeURIComponent(attemptId)}`,
      token
    ),
  desktopHandoffComplete: (token: string, attemptId: string) =>
    fetchJson<{ ok?: true; status: "completed" | "expired" }>(
      endpoints.authDesktopHandoffComplete,
      token,
      withJsonBody("POST", { attemptId })
    ),
  desktopHandoffCreate: (token: string) =>
    fetchJson<{ ok: true; code: string; expiresInSec: number }>(endpoints.authDesktopHandoff, token, withJsonBody("POST")),
  desktopHandoffExchange: (code: string) =>
    fetchJson<{ authenticated: boolean; token: string | null; user: User | null }>(
      endpoints.authDesktopHandoffExchange,
      undefined,
      withJsonBody("POST", { code })
    ),
  me: (token: string) => fetchJson<{ user: User | null }>(endpoints.me, token),
  updateMe: (token: string, input: { name: string; uiTheme?: "8-neon-bit" | "material-classic" }) =>
    fetchJson<{ user: User | null }>(endpoints.me, token, withJsonBody("PATCH", input)),
  wsTicket: (token: string) => fetchJson<{ ticket: string; expiresInSec: number }>(endpoints.wsTicket, token),
  livekitToken: (
    token: string,
    input: { roomSlug: string; canPublish?: boolean; canSubscribe?: boolean; canPublishData?: boolean }
  ) => fetchJson<LivekitTokenResponse>(endpoints.livekitToken, token, withJsonBody("POST", input)),
  rooms: (token: string) => fetchJson<{ rooms: Room[] }>(endpoints.rooms, token),
  archivedRooms: (token: string) => fetchJson<{ rooms: Room[] }>(endpoints.roomsArchived, token),
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
    input: {
      slug: string;
      title: string;
      is_public: boolean;
      kind?: RoomKind;
      category_id?: string | null;
      audio_quality_override?: AudioQuality | null;
    }
  ) =>
    fetchJson<{ room: Room }>(endpoints.rooms, token, withJsonBody("POST", input)),
  updateRoom: (
    token: string,
    roomId: string,
    input: { title: string; kind: RoomKind; category_id: string | null; audio_quality_override?: AudioQuality | null }
  ) =>
    fetchJson<{ room: Room }>(withId(endpoints.rooms, roomId), token, withJsonBody("PATCH", input)),
  moveRoom: (token: string, roomId: string, direction: "up" | "down") =>
    fetchJson<{ room: Room }>(withSuffix(endpoints.rooms, roomId, "move"), token, withJsonBody("POST", { direction })),
  deleteRoom: (token: string, roomId: string) =>
    fetchJson<{ ok: true; roomId: string; archived?: boolean }>(withId(endpoints.rooms, roomId), token, withJsonBody("DELETE")),
  restoreRoom: (token: string, roomId: string) =>
    fetchJson<{ ok: true; roomId: string; restored?: boolean }>(withSuffix(endpoints.rooms, roomId, "restore"), token, withJsonBody("POST")),
  deleteRoomPermanent: (token: string, roomId: string) =>
    fetchJson<{ ok: true; roomId: string; deleted?: boolean }>(withSuffix(endpoints.rooms, roomId, "permanent"), token, withJsonBody("DELETE")),
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
  servers: (token: string) => fetchJson<{ servers: ServerListItem[] }>(endpoints.servers, token),
  serverAudioQuality: (token: string) => fetchJson<ServerAudioQualityResponse>(endpoints.adminServerAudioQuality, token),
  serverChatImagePolicy: (token: string) =>
    fetchJson<ServerChatImagePolicyResponse>(endpoints.adminServerChatImagePolicy, token),
  updateServerAudioQuality: (token: string, audioQuality: AudioQuality) =>
    fetchJson<ServerAudioQualityResponse>(
      endpoints.adminServerAudioQuality,
      token,
      withJsonBody("PUT", { audioQuality })
    ),
  adminUsers: (token: string) => fetchJson<{ users: User[] }>(endpoints.adminUsers, token),
  promoteUser: (token: string, userId: string) =>
    fetchJson<{ user: User }>(withSuffix(endpoints.adminUsers, userId, "promote"), token, withJsonBody("POST", { role: "admin" })),
  demoteUser: (token: string, userId: string) =>
    fetchJson<{ user: User }>(withSuffix(endpoints.adminUsers, userId, "demote"), token, withJsonBody("POST", { role: "user" })),
  setUserAccessState: (token: string, userId: string, accessState: "pending" | "active" | "blocked") =>
    fetchJson<{ user: User }>(withSuffix(endpoints.adminUsers, userId, "access"), token, withJsonBody("POST", { accessState })),
  banUser: (token: string, userId: string) =>
    fetchJson<{ user: User }>(withSuffix(endpoints.adminUsers, userId, "ban"), token, withJsonBody("POST")),
  unbanUser: (token: string, userId: string) =>
    fetchJson<{ user: User }>(withSuffix(endpoints.adminUsers, userId, "unban"), token, withJsonBody("POST")),
  memberPreferences: (token: string, targetUserIds: string[]) => {
    const normalizedIds = Array.from(new Set(
      targetUserIds
        .map((id) => String(id || "").trim())
        .filter((id) => id.length > 0)
    ));

    if (normalizedIds.length === 0) {
      return Promise.resolve({ preferences: [] as RoomMemberPreference[] });
    }

    const params = new URLSearchParams();
    params.set("targetUserIds", normalizedIds.join(","));
    return fetchJson<{ preferences: RoomMemberPreference[] }>(`${endpoints.memberPreferences}?${params.toString()}`, token);
  },
  upsertMemberPreference: (token: string, targetUserId: string, input: { volume: number; note: string }) =>
    fetchJson<{ preference: RoomMemberPreference }>(
      `${endpoints.memberPreferences}/${encodeURIComponent(targetUserId)}`,
      token,
      withJsonBody("PUT", input)
    ),
  chatUploadInit: (token: string, input: { roomSlug: string; mimeType: string; sizeBytes: number }) =>
    fetchJson<ChatUploadInitResponse>(
      endpoints.chatUploadInit,
      token,
      withJsonBody("POST", input)
    ),
  uploadChatObject: (uploadUrl: string, body: Blob, headers: Record<string, string>) =>
    uploadBinary(uploadUrl, body, headers),
  chatUploadFinalize: (
    token: string,
    input: {
      uploadId: string;
      roomSlug: string;
      storageKey: string;
      mimeType: string;
      sizeBytes: number;
      text?: string;
      downloadUrl?: string;
      width?: number;
      height?: number;
      checksum?: string;
    }
  ) => fetchJson<ChatUploadFinalizeResponse>(
    endpoints.chatUploadFinalize,
    token,
    withJsonBody("POST", input)
  )
};
