import type {
  AudioQuality,
  AdminServerOverviewResponse,
  AdminServersResponse,
  AuthModeResponse,
  Message,
  MessagesCursor,
  LivekitTokenResponse,
  RoomCategory,
  Room,
  RoomKind,
  RoomMessagesResponse,
  SearchMessagesResponse,
  NotificationSettingsResponse,
  NotificationInboxListResponse,
  NotificationInboxClaimResponse,
  NotificationInboxReadResponse,
  NotificationInboxReadAllResponse,
  TopicUnreadMentionsListResponse,
  TopicUnreadMentionsReadAllResponse,
  NotificationPushPublicKeyResponse,
  NotificationPushSubscriptionResponse,
  TopicReadResponse,
  RoomTopicsListResponse,
  RoomsTreeResponse,
  ServerAudioQualityResponse,
  ServerChatImagePolicyResponse,
    TopicMessageReportResponse,
  ServerCreateResponse,
  ServerDeleteResponse,
  ServerRenameResponse,
  ServerMembersResponse,
  ServerMemberProfileResponse,
  ServerRolesResponse,
  ServerPermissionsResponse,
  ServerAuditListResponse,
  ServerAgeStatusResponse,
  ServerAgeConfirmResponse,
  InviteAcceptResponse,
  InviteCreateResponse,
  TelemetrySummary,
  TopicMessagesResponse,
  ServerListItem,
  UiTheme,
  User,
  RoomMemberPreference
} from "./domain";
import { resolveApiBase } from "./transportRuntime";
import { asTrimmedString } from "./utils/stringUtils";

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
    type: "image" | "document" | "audio";
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

// ─── DM types ───────────────────────────────────────────

export type DmThread = {
  id: string;
  userLowId: string;
  userHighId: string;
  createdAt: string;
  updatedAt: string;
  peerUserId?: string;
  peerName?: string;
  peerEmail?: string;
};

export type DmThreadWithUnread = DmThread & {
  unreadCount: number;
};

export type DmMessageItem = {
  id: string;
  threadId: string;
  senderUserId: string;
  senderName: string;
  body: string;
  attachmentsJson: unknown | null;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  replyToMessageId: string | null;
  replyToUserId: string | null;
  replyToUserName: string | null;
  replyToText: string | null;
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
  const explicitMessage = asTrimmedString(payload.message);
  if (explicitMessage) {
    return explicitMessage;
  }

  const validationMessage = firstValidationIssue(payload);
  if (validationMessage) {
    return validationMessage;
  }

  const codeMessage = asTrimmedString(payload.error);
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
  ssoRestore: "/v1/auth/sso/restore",
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
  topics: "/v1/topics",
  telemetrySummary: "/v1/telemetry/summary",
  servers: "/v1/servers",
  adminUsers: "/v1/admin/users",
  adminUsersPendingCount: "/v1/admin/users/pending-count",
  adminServers: "/v1/admin/servers",
  adminServerAudioQuality: "/v1/admin/server/audio-quality",
  adminServerChatImagePolicy: "/v1/admin/server/chat-image-policy",
  memberPreferences: "/v1/member-preferences",
  chatUploadInit: "/v1/chat/uploads/init",
  chatUploadFinalize: "/v1/chat/uploads/finalize"
} as const;

const withId = (basePath: string, id: string) => `${basePath}/${encodeURIComponent(id)}`;
const withSuffix = (basePath: string, id: string, suffix: string) => `${withId(basePath, id)}/${suffix}`;
const withServerIdQuery = (path: string, serverId?: string) => {
  const normalizedServerId = asTrimmedString(serverId);
  if (!normalizedServerId) {
    return path;
  }

  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}serverId=${encodeURIComponent(normalizedServerId)}`;
};

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
  restoreDeletedSsoAccount: () => fetchJson<{ authenticated: boolean; restored: boolean; token: string | null; user: User | null }>(
    endpoints.ssoRestore,
    undefined,
    withJsonBody("POST")
  ),
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
  updateMe: (
    token: string,
    input: {
      name: string;
      uiTheme?: UiTheme;
      walkieTalkieEnabled?: boolean;
      walkieTalkieHotkey?: string;
    }
  ) =>
    fetchJson<{ user: User | null }>(endpoints.me, token, withJsonBody("PATCH", input)),
  deleteMe: (token: string) =>
    fetchJson<{ ok: true; purgeScheduledAt: string | null; daysRemaining: number }>(endpoints.me, token, withJsonBody("DELETE")),
  acceptConsents: (
    token: string,
    input: { cookieConsent?: boolean; welcomeIntroCompleted?: boolean }
  ) =>
    fetchJson<{ user: User | null }>(`${endpoints.me}/consents`, token, withJsonBody("POST", input)),
  wsTicket: (token: string, serverId?: string) =>
    fetchJson<{ ticket: string; expiresInSec: number }>(withServerIdQuery(endpoints.wsTicket, serverId), token),
  livekitToken: (
    token: string,
    input: { roomSlug: string; canPublish?: boolean; canSubscribe?: boolean; canPublishData?: boolean }
  ) => fetchJson<LivekitTokenResponse>(endpoints.livekitToken, token, withJsonBody("POST", input)),
  rooms: (token: string, serverId?: string) => fetchJson<{ rooms: Room[] }>(withServerIdQuery(endpoints.rooms, serverId), token),
  archivedRooms: (token: string, serverId?: string) =>
    fetchJson<{ rooms: Room[] }>(withServerIdQuery(endpoints.roomsArchived, serverId), token),
  roomTree: (token: string, serverId?: string) =>
    fetchJson<RoomsTreeResponse>(withServerIdQuery(endpoints.roomsTree, serverId), token),
  createCategory: (token: string, input: { slug?: string; title: string; server_id?: string; position?: number }) =>
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
      slug?: string;
      title: string;
      is_public: boolean;
      is_hidden?: boolean;
      kind?: RoomKind;
      server_id?: string;
      category_id?: string | null;
      nsfw?: boolean;
      audio_quality_override?: AudioQuality | null;
    }
  ) =>
    fetchJson<{ room: Room }>(endpoints.rooms, token, withJsonBody("POST", input)),
  updateRoom: (
    token: string,
    roomId: string,
    input: {
      title: string;
      kind: RoomKind;
      category_id: string | null;
      is_hidden?: boolean;
      nsfw?: boolean;
      audio_quality_override?: AudioQuality | null;
    }
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
  createRoomMessage: (token: string, slug: string, input: { text: string; mentionUserIds?: string[] }) =>
    fetchJson<{ message: Message }>(withSuffix(endpoints.rooms, slug, "messages"), token, withJsonBody("POST", input)),
  roomTopics: (token: string, roomId: string) =>
    fetchJson<RoomTopicsListResponse>(withSuffix(endpoints.rooms, roomId, "topics"), token),
  createRoomTopic: (token: string, roomId: string, input: { title: string; slug?: string; position?: number }) =>
    fetchJson<{ topic: RoomTopicsListResponse["topics"][number] }>(
      withSuffix(endpoints.rooms, roomId, "topics"),
      token,
      withJsonBody("POST", input)
    ),
  updateTopic: (token: string, topicId: string, input: { title?: string; position?: number }) =>
    fetchJson<{ topic: RoomTopicsListResponse["topics"][number] }>(
      withId(endpoints.topics, topicId),
      token,
      withJsonBody("PATCH", input)
    ),
  archiveTopic: (token: string, topicId: string) =>
    fetchJson<{ topic: RoomTopicsListResponse["topics"][number] }>(
      withSuffix(endpoints.topics, topicId, "archive"),
      token,
      withJsonBody("POST")
    ),
  unarchiveTopic: (token: string, topicId: string) =>
    fetchJson<{ topic: RoomTopicsListResponse["topics"][number] }>(
      withSuffix(endpoints.topics, topicId, "unarchive"),
      token,
      withJsonBody("POST")
    ),
  deleteTopic: (token: string, topicId: string) =>
    fetchJson<{ topicId: string; roomId: string; roomSlug: string; deletedMessagesCount: number; deletedAt: string }>(
      withId(endpoints.topics, topicId),
      token,
      withJsonBody("DELETE")
    ),
  topicMessages: (
    token: string,
    topicId: string,
    options: {
      limit?: number;
      cursor?: MessagesCursor | null;
      aroundUnreadWindow?: boolean;
      anchorMessageId?: string;
      aroundWindowBefore?: number;
      aroundWindowAfter?: number;
    } = {}
  ) => {
    const params = new URLSearchParams();
    params.set("limit", String(options.limit ?? 50));

    if (options.cursor?.beforeCreatedAt && options.cursor?.beforeId) {
      params.set("beforeCreatedAt", options.cursor.beforeCreatedAt);
      params.set("beforeId", options.cursor.beforeId);
    }

    if (typeof options.aroundUnreadWindow === "boolean") {
      params.set("aroundUnreadWindow", String(options.aroundUnreadWindow));
    }

    if (asTrimmedString(options.anchorMessageId)) {
      params.set("anchorMessageId", String(options.anchorMessageId).trim());
    }

    if (typeof options.aroundWindowBefore === "number" && Number.isFinite(options.aroundWindowBefore)) {
      params.set("aroundWindowBefore", String(Math.max(0, Math.trunc(options.aroundWindowBefore))));
    }

    if (typeof options.aroundWindowAfter === "number" && Number.isFinite(options.aroundWindowAfter)) {
      params.set("aroundWindowAfter", String(Math.max(0, Math.trunc(options.aroundWindowAfter))));
    }

    return fetchJson<TopicMessagesResponse>(
      `${withSuffix(endpoints.topics, topicId, "messages")}?${params.toString()}`,
      token
    );
  },
  createTopicMessage: (token: string, topicId: string, input: { text: string; mentionUserIds?: string[] }) =>
    fetchJson<{ message: Message }>(withSuffix(endpoints.topics, topicId, "messages"), token, withJsonBody("POST", input)),
  markTopicRead: (token: string, topicId: string, input: { lastReadMessageId?: string } = {}) =>
    fetchJson<TopicReadResponse>(
      withSuffix(endpoints.topics, topicId, "read"),
      token,
      withJsonBody("POST", input)
    ),
  editMessage: (token: string, messageId: string, input: { text: string }) =>
    fetchJson<{ message: Message }>(`/v1/messages/${encodeURIComponent(messageId)}`, token, withJsonBody("PATCH", input)),
  deleteMessage: (token: string, messageId: string) =>
    fetchJson<{ messageId: string }>(`/v1/messages/${encodeURIComponent(messageId)}`, token, withJsonBody("DELETE")),
  replyMessage: (token: string, messageId: string, input: { text: string; mentionUserIds?: string[] }) =>
    fetchJson<{ message: Message; parentMessageId: string }>(
      `/v1/messages/${encodeURIComponent(messageId)}/reply`,
      token,
      withJsonBody("POST", input)
    ),
  pinMessage: (token: string, messageId: string) =>
    fetchJson<{ messageId: string; pinned: boolean }>(
      `/v1/messages/${encodeURIComponent(messageId)}/pin`,
      token,
      withJsonBody("POST")
    ),
  unpinMessage: (token: string, messageId: string) =>
    fetchJson<{ messageId: string; pinned: boolean }>(
      `/v1/messages/${encodeURIComponent(messageId)}/pin`,
      token,
      withJsonBody("DELETE")
    ),
  addMessageReaction: (token: string, messageId: string, emoji: string) =>
    fetchJson<{ messageId: string; emoji: string; active: boolean }>(
      `/v1/messages/${encodeURIComponent(messageId)}/reactions`,
      token,
      withJsonBody("POST", { emoji })
    ),
  removeMessageReaction: (token: string, messageId: string, emoji: string) =>
    fetchJson<{ messageId: string; emoji: string; active: boolean }>(
      `/v1/messages/${encodeURIComponent(messageId)}/reactions/${encodeURIComponent(emoji)}`,
      token,
      withJsonBody("DELETE")
    ),
  reportMessage: (token: string, messageId: string, input: { reason: string; details?: string }) =>
    fetchJson<TopicMessageReportResponse>(
      `/v1/messages/${encodeURIComponent(messageId)}/report`,
      token,
      withJsonBody("POST", input)
    ),
  searchMessages: (
    token: string,
    input: {
      q: string;
      scope?: "all" | "server" | "room" | "topic";
      serverId?: string;
      roomId?: string;
      topicId?: string;
      authorId?: string;
      hasAttachment?: boolean;
      attachmentType?: "image";
      hasLink?: boolean;
      hasMention?: boolean;
      from?: string;
      to?: string;
      limit?: number;
      beforeCreatedAt?: string;
      beforeId?: string;
    }
  ) => {
    const params = new URLSearchParams();
    params.set("q", String(input.q || ""));
    params.set("scope", String(input.scope || "all"));

    if (input.serverId) {
      params.set("serverId", input.serverId);
    }

    if (input.roomId) {
      params.set("roomId", input.roomId);
    }

    if (input.topicId) {
      params.set("topicId", input.topicId);
    }

    if (input.authorId) {
      params.set("authorId", input.authorId);
    }

    if (typeof input.hasAttachment === "boolean") {
      params.set("hasAttachment", String(input.hasAttachment));
    }

    if (input.attachmentType) {
      params.set("attachmentType", input.attachmentType);
    }

    if (typeof input.hasLink === "boolean") {
      params.set("hasLink", String(input.hasLink));
    }

    if (typeof input.hasMention === "boolean") {
      params.set("hasMention", String(input.hasMention));
    }

    if (input.from) {
      params.set("from", input.from);
    }

    if (input.to) {
      params.set("to", input.to);
    }

    if (typeof input.limit === "number") {
      params.set("limit", String(input.limit));
    }

    if (input.beforeCreatedAt && input.beforeId) {
      params.set("beforeCreatedAt", input.beforeCreatedAt);
      params.set("beforeId", input.beforeId);
    }

    return fetchJson<SearchMessagesResponse>(`/v1/search/messages?${params.toString()}`, token);
  },
  updateNotificationSettings: (
    token: string,
    input: {
      scopeType: "server" | "room" | "topic";
      serverId?: string;
      roomId?: string;
      topicId?: string;
      mode: "all" | "mentions" | "none";
      allowCriticalMentions?: boolean;
      muteUntil?: string | null;
    }
  ) => fetchJson<NotificationSettingsResponse>(
    "/v1/notification-settings",
    token,
    withJsonBody("PATCH", input)
  ),
  notificationInbox: (
    token: string,
    input: {
      limit?: number;
      unreadOnly?: boolean;
      beforeCreatedAt?: string;
      beforeId?: string;
    } = {}
  ) => {
    const params = new URLSearchParams();
    params.set("limit", String(input.limit ?? 20));
    if (typeof input.unreadOnly === "boolean") {
      params.set("unreadOnly", String(input.unreadOnly));
    }
    if (input.beforeCreatedAt && input.beforeId) {
      params.set("beforeCreatedAt", input.beforeCreatedAt);
      params.set("beforeId", input.beforeId);
    }

    return fetchJson<NotificationInboxListResponse>(`/v1/notifications/inbox?${params.toString()}`, token);
  },
  markNotificationInboxRead: (token: string, eventId: string) =>
    fetchJson<NotificationInboxReadResponse>(
      `/v1/notifications/inbox/${encodeURIComponent(eventId)}/read`,
      token,
      withJsonBody("POST")
    ),
  claimNotificationInbox: (token: string, eventId: string) =>
    fetchJson<NotificationInboxClaimResponse>(
      `/v1/notifications/inbox/${encodeURIComponent(eventId)}/claim`,
      token,
      withJsonBody("POST")
    ),
  markNotificationInboxReadAll: (token: string) =>
    fetchJson<NotificationInboxReadAllResponse>(
      "/v1/notifications/inbox/read-all",
      token,
      withJsonBody("POST")
    ),
  topicUnreadMentions: (
    token: string,
    topicId: string,
    input: {
      limit?: number;
      beforeCreatedAt?: string;
      beforeId?: string;
    } = {}
  ) => {
    const params = new URLSearchParams();
    params.set("limit", String(input.limit ?? 20));
    if (input.beforeCreatedAt && input.beforeId) {
      params.set("beforeCreatedAt", input.beforeCreatedAt);
      params.set("beforeId", input.beforeId);
    }

    return fetchJson<TopicUnreadMentionsListResponse>(
      `/v1/topics/${encodeURIComponent(topicId)}/unread-mentions?${params.toString()}`,
      token
    );
  },
  markTopicUnreadMentionsReadAll: (token: string, topicId: string) =>
    fetchJson<TopicUnreadMentionsReadAllResponse>(
      `/v1/topics/${encodeURIComponent(topicId)}/unread-mentions/read-all`,
      token,
      withJsonBody("POST")
    ),
  notificationPushPublicKey: (token: string) =>
    fetchJson<NotificationPushPublicKeyResponse>(
      "/v1/notifications/push/public-key",
      token
    ),
  upsertNotificationPushSubscription: (
    token: string,
    input: {
      endpoint: string;
      keys: { p256dh: string; auth: string };
      expirationTime?: string | null;
      runtime?: "web" | "desktop";
    }
  ) => fetchJson<NotificationPushSubscriptionResponse>(
    "/v1/notifications/push/subscriptions",
    token,
    withJsonBody("PUT", input)
  ),
  removeNotificationPushSubscription: (
    token: string,
    endpoint: string
  ) => fetchJson<NotificationPushSubscriptionResponse>(
    "/v1/notifications/push/subscriptions",
    token,
    withJsonBody("DELETE", { endpoint })
  ),
  telemetrySummary: (token: string) => fetchJson<TelemetrySummary>(endpoints.telemetrySummary, token),
  servers: (token: string) => fetchJson<{ servers: ServerListItem[] }>(endpoints.servers, token),
  createServer: (token: string, input: { name: string }) =>
    fetchJson<ServerCreateResponse>(endpoints.servers, token, withJsonBody("POST", input)),
  renameServer: (token: string, serverId: string, input: { name: string }) =>
    fetchJson<ServerRenameResponse>(withId(endpoints.servers, serverId), token, withJsonBody("PATCH", input)),
  deleteServer: (token: string, serverId: string) =>
    fetchJson<ServerDeleteResponse>(withId(endpoints.servers, serverId), token, withJsonBody("DELETE")),
  serverMembers: (token: string, serverId: string) =>
    fetchJson<ServerMembersResponse>(withSuffix(endpoints.servers, serverId, "members"), token),
  serverMemberProfile: (token: string, serverId: string, userId: string) =>
    fetchJson<ServerMemberProfileResponse>(withId(withSuffix(endpoints.servers, serverId, "members"), userId) + "/profile", token),
  serverRoles: (token: string, serverId: string) =>
    fetchJson<ServerRolesResponse>(withSuffix(endpoints.servers, serverId, "roles"), token),
  serverPermissions: (token: string, serverId: string) =>
    fetchJson<ServerPermissionsResponse>(withSuffix(endpoints.servers, serverId, "permissions/me"), token),
  serverAudit: (token: string, serverId: string, input: { limit?: number } = {}) => {
    const params = new URLSearchParams();
    params.set("limit", String(input.limit ?? 50));
    return fetchJson<ServerAuditListResponse>(
      `${withSuffix(endpoints.servers, serverId, "audit")}?${params.toString()}`,
      token
    );
  },
  createServerRole: (token: string, serverId: string, name: string) =>
    fetchJson<{ role: { id: string; name: string } }>(
      withSuffix(endpoints.servers, serverId, "roles"),
      token,
      withJsonBody("POST", { name })
    ),
  renameServerRole: (token: string, serverId: string, roleId: string, name: string) =>
    fetchJson<{ role: { id: string; name: string } }>(
      withId(withSuffix(endpoints.servers, serverId, "roles"), roleId),
      token,
      withJsonBody("PATCH", { name })
    ),
  deleteServerRole: (token: string, serverId: string, roleId: string) =>
    fetchJson<{ deleted: boolean; roleId: string }>(
      withId(withSuffix(endpoints.servers, serverId, "roles"), roleId),
      token,
      withJsonBody("DELETE")
    ),
  setServerMemberCustomRoles: (token: string, serverId: string, userId: string, roleIds: string[]) =>
    fetchJson<{ ok: true; serverId: string; userId: string; roleIds: string[] }>(
      `${withId(withSuffix(endpoints.servers, serverId, "members"), userId)}/custom-roles`,
      token,
      withJsonBody("PUT", { roleIds })
    ),
  setServerMemberHiddenRoomAccess: (token: string, serverId: string, userId: string, roomIds: string[]) =>
    fetchJson<{ ok: true; serverId: string; userId: string; roomIds: string[] }>(
      `${withId(withSuffix(endpoints.servers, serverId, "members"), userId)}/hidden-room-access`,
      token,
      withJsonBody("PUT", { roomIds })
    ),
  serverAgeStatus: (token: string, serverId: string) =>
    fetchJson<ServerAgeStatusResponse>(withSuffix(endpoints.servers, serverId, "age-confirm"), token),
  confirmServerAge: (token: string, serverId: string, source = "server-menu") =>
    fetchJson<ServerAgeConfirmResponse>(
      withSuffix(endpoints.servers, serverId, "age-confirm"),
      token,
      withJsonBody("POST", { source })
    ),
  revokeServerAge: (token: string, serverId: string, source = "server-menu") =>
    fetchJson<ServerAgeConfirmResponse>(
      withSuffix(endpoints.servers, serverId, "age-confirm"),
      token,
      withJsonBody("POST", { source, revoke: true })
    ),
  leaveServer: (token: string, serverId: string) =>
    fetchJson<{ left: boolean }>(withSuffix(endpoints.servers, serverId, "members/me"), token, withJsonBody("DELETE")),
  removeServerMember: (token: string, serverId: string, userId: string) =>
    fetchJson<{ removed: boolean }>(withId(withSuffix(endpoints.servers, serverId, "members"), userId), token, withJsonBody("DELETE")),
  transferServerOwnership: (token: string, serverId: string, userId: string) =>
    fetchJson<{ transferred: boolean }>(withSuffix(endpoints.servers, serverId, "owner"), token, withJsonBody("POST", { userId })),
  applyServerBan: (token: string, serverId: string, userId: string, reason?: string) =>
    fetchJson<{ ban: { id: string; serverId: string; userId: string } }>(
      withSuffix(endpoints.servers, serverId, "bans"),
      token,
      withJsonBody("POST", { userId, ...(reason ? { reason } : {}) })
    ),
  revokeServerBan: (token: string, serverId: string, userId: string) =>
    fetchJson<{ revoked: boolean }>(withId(withSuffix(endpoints.servers, serverId, "bans"), userId), token, withJsonBody("DELETE")),
  createServerInvite: (
    token: string,
    serverId: string,
    input: { ttlHours?: number; maxUses?: number } = {}
  ) => fetchJson<InviteCreateResponse>(withSuffix(endpoints.servers, serverId, "invites"), token, withJsonBody("POST", input)),
  acceptServerInvite: (token: string, inviteToken: string) =>
    fetchJson<InviteAcceptResponse>(`/v1/invites/${encodeURIComponent(inviteToken)}/accept`, token, withJsonBody("POST")),
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
  adminUsersPendingCount: (token: string) => fetchJson<{ count: number }>(endpoints.adminUsersPendingCount, token),
  adminServers: (token: string) => fetchJson<AdminServersResponse>(endpoints.adminServers, token),
  adminServerOverview: (token: string, serverId: string) =>
    fetchJson<AdminServerOverviewResponse>(withSuffix(endpoints.adminServers, serverId, "overview"), token),
  adminSetServerBlocked: (token: string, serverId: string, blocked: boolean) =>
    fetchJson<{ serverId: string; isBlocked: boolean }>(
      withSuffix(endpoints.adminServers, serverId, "block"),
      token,
      withJsonBody("POST", { blocked })
    ),
  adminDeleteServer: (token: string, serverId: string) =>
    fetchJson<{ deleted: boolean }>(withId(endpoints.adminServers, serverId), token, withJsonBody("DELETE")),
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
  deleteUser: (token: string, userId: string) =>
    fetchJson<{ user: User }>(withSuffix(endpoints.adminUsers, userId, "delete"), token, withJsonBody("POST")),
  forceDeleteUserNow: (token: string, userId: string) =>
    fetchJson<{ deleted: boolean }>(withSuffix(endpoints.adminUsers, userId, "force-delete"), token, withJsonBody("DELETE")),
  memberPreferences: (token: string, targetUserIds: string[]) => {
    const normalizedIds = Array.from(new Set(
      targetUserIds
        .map((id) => asTrimmedString(id))
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
  chatUploadInit: (token: string, input: { roomSlug: string; topicId?: string; mimeType: string; sizeBytes: number }) =>
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
      topicId?: string;
      storageKey: string;
      mimeType: string;
      sizeBytes: number;
      text?: string;
      mentionUserIds?: string[];
      downloadUrl?: string;
      width?: number;
      height?: number;
      checksum?: string;
    }
  ) => fetchJson<ChatUploadFinalizeResponse>(
    endpoints.chatUploadFinalize,
    token,
    withJsonBody("POST", input)
  ),

  // ─── DM ───────────────────────────────────────────

  dmCreateThread: (token: string, peerUserId: string) =>
    fetchJson<{ thread: DmThread }>("/v1/dm/threads", token, withJsonBody("POST", { peerUserId })),
  dmGetThreads: (token: string) =>
    fetchJson<{ threads: DmThreadWithUnread[] }>("/v1/dm/threads", token),
  dmGetMessages: (token: string, threadId: string, cursor?: string, limit?: number) =>
    fetchJson<{ messages: DmMessageItem[]; hasMore: boolean }>(
      `/v1/dm/threads/${encodeURIComponent(threadId)}/messages${cursor ? `?cursor=${encodeURIComponent(cursor)}&limit=${limit || 50}` : `?limit=${limit || 50}`}`,
      token
    ),
  dmSendMessage: (token: string, threadId: string, body: string, replyToMessageId?: string) =>
    fetchJson<{ message: DmMessageItem }>(
      `/v1/dm/threads/${encodeURIComponent(threadId)}/messages`,
      token,
      withJsonBody("POST", { body, ...(replyToMessageId ? { replyToMessageId } : {}) })
    ),
  dmEditMessage: (token: string, messageId: string, body: string) =>
    fetchJson<{ message: DmMessageItem }>(
      `/v1/dm/messages/${encodeURIComponent(messageId)}`,
      token,
      withJsonBody("PATCH", { body })
    ),
  dmDeleteMessage: (token: string, messageId: string) =>
    fetchJson<{ ok: true }>(
      `/v1/dm/messages/${encodeURIComponent(messageId)}`,
      token,
      withJsonBody("DELETE")
    ),
  dmMarkRead: (token: string, threadId: string, lastReadMessageId: string) =>
    fetchJson<{ ok: true }>(
      `/v1/dm/threads/${encodeURIComponent(threadId)}/read`,
      token,
      withJsonBody("POST", { lastReadMessageId })
    ),
  dmUploadInit: (token: string, threadId: string, input: { mimeType: string; sizeBytes: number }) =>
    fetchJson<ChatUploadInitResponse>(
      `/v1/dm/threads/${encodeURIComponent(threadId)}/uploads/init`,
      token,
      withJsonBody("POST", input)
    ),
  dmUploadFinalize: (token: string, threadId: string, input: { uploadId: string; storageKey: string; mimeType: string; sizeBytes: number; text?: string }) =>
    fetchJson<{ message: DmMessageItem }>(
      `/v1/dm/threads/${encodeURIComponent(threadId)}/uploads/finalize`,
      token,
      withJsonBody("POST", input)
    ),
  dmToggleReaction: (token: string, messageId: string, emoji: string, active: boolean) =>
    fetchJson<{ ok: true }>(
      `/v1/dm/messages/${encodeURIComponent(messageId)}/reactions`,
      token,
      withJsonBody("POST", { emoji, active })
    ),
  dmGetReactions: (token: string, threadId: string) =>
    fetchJson<{ reactions: Array<{ messageId: string; emoji: string; userId: string }> }>(
      `/v1/dm/threads/${encodeURIComponent(threadId)}/reactions`,
      token
    )
};
