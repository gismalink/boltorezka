export type AuthModeResponse = {
  mode: string;
  ssoBaseUrl: string;
};

export type UiTheme = "8-neon-bit" | "material-classic" | "aka-dis" | "alpha-strike";

export type User = {
  id: string;
  email: string;
  username: string | null;
  name: string;
  ui_theme: UiTheme;
  walkie_talkie_enabled?: boolean;
  walkie_talkie_hotkey?: string;
  role: "user" | "admin" | "super_admin";
  is_banned: boolean;
  access_state: "pending" | "active" | "blocked";
  is_bot: boolean;
  is_readonly?: boolean;
  slowmode_seconds?: number;
  deleted_at?: string | null;
  purge_scheduled_at?: string | null;
  created_at: string;
};

export type RoomKind = "text" | "text_voice" | "text_voice_video";

export type AudioQuality = "retro" | "low" | "standard" | "high";

export type ChannelAudioQualitySetting = "server_default" | AudioQuality;

export type RoomCategory = {
  id: string;
  slug: string;
  title: string;
  position: number;
  created_at: string;
};

export type Room = {
  id: string;
  slug: string;
  title: string;
  kind: RoomKind;
  is_hidden?: boolean;
  nsfw?: boolean;
  audio_quality_override?: AudioQuality | null;
  category_id: string | null;
  position: number;
  is_public: boolean;
  created_at: string;
  is_member?: boolean;
  member_names?: string[];
};

export type RoomsTreeResponse = {
  categories: Array<RoomCategory & { channels: Room[] }>;
  uncategorized: Room[];
};

export type Message = {
  id: string;
  room_id: string;
  topic_id?: string | null;
  reply_to_message_id?: string | null;
  reply_to_user_id?: string | null;
  reply_to_user_name?: string | null;
  reply_to_text?: string | null;
  user_id: string;
  text: string;
  created_at: string;
  edited_at?: string | null;
  user_name: string;
  attachments?: ChatAttachment[];
  reactions?: Array<{
    emoji: string;
    count: number;
    reacted: boolean;
  }>;
  unread_divider_anchor?: boolean;
  clientRequestId?: string;
  deliveryStatus?: "sending" | "delivered" | "failed";
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
export type ChatAttachment = {
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

export type MessagesCursor = {
  beforeCreatedAt: string;
  beforeId: string;
};

export type PresenceMember = {
  userId: string;
  userName: string;
};

export type RoomMemberPreference = {
  targetUserId: string;
  volume: number;
  note: string;
  updatedAt: string;
};

export type RoomMessagesResponse = {
  room: Room;
  messages: Message[];
  pagination: {
    hasMore: boolean;
    nextCursor: MessagesCursor | null;
  };
};

export type RoomTopic = {
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
  topics: RoomTopic[];
};

export type TopicMessagesResponse = {
  room: Room;
  topic: {
    id: string;
    roomId: string;
    slug: string;
    title: string;
    archivedAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
  unreadDividerMessageId?: string | null;
  messages: Message[];
  pagination: {
    hasMore: boolean;
    nextCursor: MessagesCursor | null;
  };
};

export type MessageSearchScope = "all" | "server" | "room" | "topic";

export type MessageSearchItem = {
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
  attachmentType?: "image";
};

export type SearchMessagesResponse = {
  messages: MessageSearchItem[];
  pagination: {
    hasMore: boolean;
    nextCursor: {
      beforeCreatedAt: string;
      beforeId: string;
    } | null;
  };
};

export type TopicMessageReportResponse = {
  ok: true;
  reportId: string;
  messageId: string;
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

export type TopicUnreadMentionsListResponse = {
  topicId: string;
  items: NotificationInboxItem[];
  pagination: {
    hasMore: boolean;
    nextCursor: {
      beforeCreatedAt: string;
      beforeId: string;
    } | null;
  };
};

export type TopicUnreadMentionsReadAllResponse = {
  topicId: string;
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
  unreadDelta?: number;
  mentionDelta?: number;
};

export type WsIncoming = {
  type: string;
  realtimeSeq?: number;
  realtime_seq?: number;
  realtimeScope?: string;
  realtime_scope?: string;
  realtimeScopeSeq?: number;
  realtime_scope_seq?: number;
  payload?: any;
};

export type WsOutgoing = {
  type: string;
  requestId: string;
  idempotencyKey?: string;
  payload?: Record<string, unknown>;
};

export type TelemetrySummary = {
  day: string;
  metrics: {
    nack_sent: number;
    ack_sent: number;
    chat_sent: number;
    chat_idempotency_hit: number;
    telemetry_web_event: number;
    rnnoise_toggle_on: number;
    rnnoise_toggle_off: number;
    rnnoise_init_error: number;
    rnnoise_fallback_unavailable: number;
    rnnoise_process_cost_us_sum: number;
    rnnoise_process_cost_samples: number;
  };
};

export type LivekitTokenResponse = {
  token: string;
  url: string;
  roomName: string;
  roomId: string;
  mediaTopology: "livekit";
  traceId: string;
};

export type ServerAudioQualityResponse = {
  audioQuality: AudioQuality;
};

export type ServerChatImagePolicyResponse = {
  maxDataUrlLength: number;
  maxImageSide: number;
  jpegQuality: number;
};

export type ServerMemberRole = "owner" | "admin" | "member";

export type ServerListItem = {
  id: string;
  slug: string;
  name: string;
  role: ServerMemberRole;
  membersCount: number;
};

export type ServerCreateResponse = {
  server: ServerListItem;
};

export type ServerRenameResponse = {
  server: ServerListItem;
};

export type ServerDeleteResponse = {
  deleted: boolean;
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
  globalRole: "user" | "admin" | "super_admin";
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

export type ServerAgeStatusResponse = {
  serverId: string;
  confirmed: boolean;
  confirmedAt: string | null;
};

export type ServerAgeConfirmResponse = {
  ok: boolean;
  serverId: string;
  confirmed: boolean;
  confirmedAt: string | null;
};

export type InviteCreateResponse = {
  inviteUrl: string;
  token: string;
  expiresAt: string | null;
};

export type InviteAcceptResponse = {
  server: {
    id: string;
    slug: string;
    name: string;
    role: ServerMemberRole;
  };
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
