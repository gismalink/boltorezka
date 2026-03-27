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
};

export type ServerMembersResponse = {
  serverId: string;
  members: ServerMemberItem[];
};

export type ServerRenameResponse = {
  server: ServerListItem;
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
  confirmedAt: string;
};

export type ServerAgeStatusResponse = {
  serverId: string;
  confirmed: boolean;
  confirmedAt: string | null;
};
