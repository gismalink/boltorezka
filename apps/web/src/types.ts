export type AuthModeResponse = {
  mode: string;
  ssoBaseUrl: string;
};

export type UiTheme = "8-neon-bit" | "material-classic";

export type User = {
  id: string;
  email: string;
  username: string | null;
  name: string;
  ui_theme: UiTheme;
  role: "user" | "admin" | "super_admin";
  is_banned: boolean;
  access_state: "pending" | "active" | "blocked";
  is_bot: boolean;
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
  user_id: string;
  text: string;
  created_at: string;
  edited_at?: string | null;
  user_name: string;
  attachments?: ChatAttachment[];
  clientRequestId?: string;
  deliveryStatus?: "sending" | "delivered" | "failed";
};

export type ChatAttachment = {
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

export type WsIncoming = {
  type: string;
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

export type ServerMemberItem = {
  userId: string;
  email: string;
  name: string;
  role: ServerMemberRole;
  status: "active";
  isServerBanned: boolean;
};

export type ServerMembersResponse = {
  serverId: string;
  members: ServerMemberItem[];
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
