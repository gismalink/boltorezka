import type {
  MessageAttachmentRow,
  RoomCategoryRow,
  RoomListRow,
  RoomMessageRow,
  RoomRow,
  ServerMemberRole,
  ServerRow,
  UserRow
} from "./db.types.ts";

export type AudioQuality = "retro" | "low" | "standard" | "high";

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

export type LivekitTokenResponse = {
  token: string;
  url: string;
  room: string;
  roomId: string;
  identity: string;
  expiresInSec: number;
  issuedAt: string;
  mediaTopology: "livekit";
  traceId: string;
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

export type RoomCategoryCreateResponse = {
  category: RoomCategoryRow;
};

export type RoomCategoryTreeItem = RoomCategoryRow & {
  channels: RoomListRow[];
};

export type RoomsTreeResponse = {
  categories: RoomCategoryTreeItem[];
  uncategorized: RoomListRow[];
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

export type RoomTopicItem = {
  id: string;
  roomId: string;
  createdBy: string | null;
  slug: string;
  title: string;
  position: number;
  isPinned: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  unreadCount: number;
  mentionUnreadCount: number;
};

export type RoomTopicsListResponse = {
  topics: RoomTopicItem[];
};

export type RoomTopicResponse = {
  topic: RoomTopicItem;
};

export type RoomTopicDeleteResponse = {
  topicId: string;
  roomId: string;
  roomSlug: string;
  deletedMessagesCount: number;
  deletedAt: string;
};

export type TopicMessagesResponse = {
  room: RoomRow;
  topic: {
    id: string;
    roomId: string;
    slug: string;
    title: string;
    archivedAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
  messages: RoomMessageRow[];
  pagination: {
    hasMore: boolean;
    nextCursor: {
      beforeCreatedAt: string;
      beforeId: string;
    } | null;
  };
};

export type TopicMessageCreateResponse = {
  room: RoomRow;
  topic: {
    id: string;
    roomId: string;
    slug: string;
    title: string;
    archivedAt: string | null;
  };
  message: RoomMessageRow;
};

export type TopicMessageUpdateResponse = {
  room: RoomRow;
  topic: {
    id: string;
    roomId: string;
    slug: string;
  };
  message: RoomMessageRow;
};

export type TopicMessageDeleteResponse = {
  room: RoomRow;
  topic: {
    id: string;
    roomId: string;
    slug: string;
  };
  messageId: string;
  deletedAt: string;
};

export type TopicMessageReplyResponse = {
  room: RoomRow;
  topic: {
    id: string;
    roomId: string;
    slug: string;
    title: string;
    archivedAt: string | null;
  };
  message: RoomMessageRow;
  parentMessageId: string;
};

export type TopicMessagePinResponse = {
  room: RoomRow;
  topic: {
    id: string;
    roomId: string;
    slug: string;
  };
  messageId: string;
  pinned: boolean;
};

export type TopicMessageReactionResponse = {
  room: RoomRow;
  topic: {
    id: string;
    roomId: string;
    slug: string;
  };
  messageId: string;
  emoji: string;
  userId: string;
  active: boolean;
};

export type TopicMessageReportResponse = {
  ok: true;
  reportId: string;
  messageId: string;
};

export type SearchMessagesResponse = {
  messages: Array<{
    id: string;
    roomId: string;
    roomSlug: string;
    roomTitle: string;
    topicId: string | null;
    topicSlug: string | null;
    topicTitle: string | null;
    userId: string;
    userName: string;
    text: string;
    createdAt: string;
    editedAt: string | null;
    hasAttachments: boolean;
    attachmentCount: number;
  }>;
  pagination: {
    hasMore: boolean;
    nextCursor: {
      beforeCreatedAt: string;
      beforeId: string;
    } | null;
  };
};

export type NotificationSettingsResponse = {
  settings: {
    id: string;
    userId: string;
    scopeType: "server" | "room" | "topic";
    serverId: string | null;
    roomId: string | null;
    topicId: string | null;
    mode: "all" | "mentions" | "none";
    muteUntil: string | null;
    allowCriticalMentions: boolean;
    createdAt: string;
    updatedAt: string;
  };
};

export type NotificationInboxItem = {
  id: string;
  userId: string;
  eventType: "reply_to_me" | "mention_me" | "message_pinned" | "moderation_action";
  priority: "normal" | "critical";
  serverId: string | null;
  roomId: string | null;
  topicId: string | null;
  messageId: string | null;
  actorUserId: string | null;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  createdAt: string;
  readAt: string | null;
};

export type NotificationInboxListResponse = {
  items: NotificationInboxItem[];
  pagination: {
    hasMore: boolean;
    nextCursor: {
      beforeCreatedAt: string;
      beforeId: string;
    } | null;
  };
};

export type NotificationInboxReadResponse = {
  eventId: string;
  read: boolean;
};

export type NotificationInboxReadAllResponse = {
  updated: number;
};

export type NotificationInboxClaimResponse = {
  eventId: string;
  claimed: boolean;
  ttlSec: number;
};

export type NotificationPushPublicKeyResponse = {
  enabled: boolean;
  publicKey: string | null;
};

export type NotificationPushSubscriptionResponse = {
  ok: boolean;
};

export type TopicReadResponse = {
  topicId: string;
  lastReadMessageId: string | null;
  lastReadAt: string;
};

export type AdminUsersResponse = {
  users: UserRow[];
};

export type PromoteUserResponse = {
  user: UserRow;
};

export type ServerAudioQualityResponse = {
  audioQuality: AudioQuality;
};

export type ServerChatImagePolicyResponse = {
  maxDataUrlLength: number;
  maxImageSide: number;
  jpegQuality: number;
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
  message: RoomMessageRow;
  attachment: MessageAttachmentRow;
};

export type ServerListItem = {
  id: string;
  slug: string;
  name: string;
  role: ServerMemberRole;
  membersCount: number;
};

export type ServersListResponse = {
  servers: ServerListItem[];
};

export type ServerCreateResponse = {
  server: ServerListItem;
};

export type ServerGetResponse = {
  server: ServerListItem;
};

export type ServerMemberItem = {
  userId: string;
  email: string;
  name: string;
  role: ServerMemberRole;
  status: "active";
  joinedAt: string;
  lastSeenAt?: string | null;
  customRoles: Array<{ id: string; name: string }>;
  isServerBanned: boolean;
};

export type ServerRoleItem = {
  id: string;
  name: string;
  isBase: boolean;
};

export type ServerRolesResponse = {
  serverId: string;
  roles: ServerRoleItem[];
};

export type ServerPermissionsResponse = {
  serverId: string;
  globalRole: UserRow["role"];
  serverRole: ServerMemberRole;
  customRoles: Array<{ id: string; name: string }>;
  customBadges: Array<{ id: string; name: string }>;
  permissions: {
    manageRooms: boolean;
    manageTopics: boolean;
    moderateMembers: boolean;
    manageInvites: boolean;
    manageRoles: boolean;
    viewModerationAudit: boolean;
    manageServer: boolean;
    manageGlobalUsers: boolean;
    manageServiceControlPlane: boolean;
    viewTelemetry: boolean;
  };
};

export type ServerAuditListResponse = {
  serverId: string;
  entries: Array<{
    id: string;
    action: string;
    actorUserId: string | null;
    actorUserName: string | null;
    targetUserId: string | null;
    targetUserName: string | null;
    meta: Record<string, unknown>;
    createdAt: string;
  }>;
};

export type ServerMemberProfileResponse = {
  serverId: string;
  member: {
    userId: string;
    name: string;
    email: string;
    joinedAt: string;
    role: ServerMemberRole;
    customRoles: Array<{ id: string; name: string }>;
    hiddenRoomAccess: Array<{ roomId: string; roomSlug: string; roomTitle: string }>;
    hiddenRoomsAvailable: Array<{ roomId: string; roomSlug: string; roomTitle: string; hasAccess: boolean }>;
  };
};

export type ServerMembersResponse = {
  serverId: string;
  members: ServerMemberItem[];
};

export type ServerMemberLeaveResponse = {
  left: boolean;
};

export type ServerMemberRemoveResponse = {
  removed: boolean;
};

export type ServerOwnerTransferResponse = {
  transferred: boolean;
};

export type ServerRenameResponse = {
  server: ServerListItem;
};

export type ServerDeleteResponse = {
  deleted: boolean;
};

export type ServerContext = Pick<ServerRow, "id" | "slug" | "name"> & {
  role: ServerMemberRole;
};

export type InviteCreateResponse = {
  inviteUrl: string;
  token: string;
  expiresAt: string | null;
};

export type InviteAcceptResponse = {
  server: ServerContext;
};

export type ServerBanResponse = {
  ban: {
    id: string;
    serverId: string;
    userId: string;
    reason: string | null;
    expiresAt: string | null;
    createdAt: string;
  };
};

export type ServerBanRevokeResponse = {
  revoked: boolean;
};

export type ServerMuteResponse = {
  mute: {
    id: string;
    serverId: string;
    userId: string;
    reason: string | null;
    expiresAt: string | null;
    createdAt: string;
  };
};

export type ServerMuteRevokeResponse = {
  revoked: boolean;
};

export type ServiceBanResponse = {
  ban: {
    id: string;
    userId: string;
    reason: string | null;
    expiresAt: string | null;
    createdAt: string;
  };
};

export type ServiceBanRevokeResponse = {
  revoked: boolean;
};

export type AdminServerListItem = {
  id: string;
  slug: string;
  name: string;
  isDefault: boolean;
  isBlocked: boolean;
  ownerUserId: string | null;
  ownerName: string | null;
  membersCount: number;
  roomsCount: number;
  messagesCount: number;
  activeServerBansCount: number;
  createdAt: string;
  updatedAt: string;
};

export type AdminServersResponse = {
  servers: AdminServerListItem[];
};

export type AdminServerOverview = {
  id: string;
  slug: string;
  name: string;
  isDefault: boolean;
  ownerUserId: string | null;
  ownerName: string | null;
  createdAt: string;
  updatedAt: string;
  metrics: {
    members: {
      total: number;
      active: number;
      invited: number;
      removed: number;
      left: number;
      owners: number;
      admins: number;
    };
    rooms: {
      total: number;
      nsfw: number;
      archived: number;
    };
    messages: {
      total: number;
    };
    invites: {
      total: number;
      active: number;
      revoked: number;
      expired: number;
    };
    serverBans: {
      total: number;
      active: number;
    };
  };
};

export type AdminServerOverviewResponse = {
  server: AdminServerOverview;
};

export type ServerAgeConfirmResponse = {
  ok: true;
  serverId: string;
  confirmed: boolean;
  confirmedAt: string | null;
};

export type ServerAgeStatusResponse = {
  serverId: string;
  confirmed: boolean;
  confirmedAt: string | null;
};
