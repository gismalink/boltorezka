export type UserRole = "user" | "admin" | "super_admin";
export type UserAccessState = "pending" | "active" | "blocked";
export type UiTheme = "8-neon-bit" | "material-classic" | "aka-dis" | "alpha-strike";

export type UserRow = {
  id: string;
  email: string;
  username: string | null;
  name: string;
  ui_theme: UiTheme;
  walkie_talkie_enabled?: boolean;
  walkie_talkie_hotkey?: string;
  role: UserRole;
  is_banned: boolean;
  access_state: UserAccessState;
  is_bot: boolean;
  deleted_at?: string | null;
  purge_scheduled_at?: string | null;
  created_at: string;
};

export type UserCompactRow = {
  id: string;
  email: string;
  username: string | null;
  name: string;
  ui_theme: UiTheme;
  walkie_talkie_enabled?: boolean;
  walkie_talkie_hotkey?: string;
  role: UserRole;
  is_banned: boolean;
  access_state: UserAccessState;
  is_bot: boolean;
  deleted_at?: string | null;
  purge_scheduled_at?: string | null;
};

export type RoomKind = "text" | "text_voice" | "text_voice_video";

export type RoomCategoryRow = {
  id: string;
  slug: string;
  title: string;
  position: number;
  created_at: string;
};

export type RoomRow = {
  id: string;
  slug: string;
  title: string;
  kind: RoomKind;
  is_hidden?: boolean;
  audio_quality_override?: AudioQuality | null;
  category_id: string | null;
  server_id?: string;
  nsfw?: boolean;
  position: number;
  is_public: boolean;
  created_at?: string;
};

export type RoomListRow = RoomRow & {
  is_member: boolean;
};

export type RoomMessageRow = {
  id: string;
  room_id: string;
  topic_id?: string | null;
  user_id: string;
  text: string;
  created_at: string;
  edited_at?: string | null;
  user_name: string;
  attachments?: MessageAttachmentRow[];
};

export type MessageAttachmentType = "image";

export type MessageAttachmentRow = {
  id: string;
  message_id: string;
  type: MessageAttachmentType;
  storage_key: string;
  download_url: string | null;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  checksum: string | null;
  created_at: string;
};

export type InsertedMessageRow = {
  id: string;
  room_id: string;
  topic_id?: string | null;
  user_id: string;
  body: string;
  created_at: string;
};

export type RoomTopicRow = {
  id: string;
  room_id: string;
  slug: string;
  title: string;
  created_by: string | null;
  position: number;
  is_pinned: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type RoomReadRow = {
  user_id: string;
  room_id: string;
  topic_id: string;
  last_read_message_id: string | null;
  last_read_at: string;
};

export type RoomNotificationMode = "all" | "mentions" | "none";
export type RoomNotificationScopeType = "server" | "room" | "topic";

export type RoomNotificationSettingsRow = {
  id: string;
  user_id: string;
  scope_type: RoomNotificationScopeType;
  server_id: string | null;
  room_id: string | null;
  topic_id: string | null;
  mode: RoomNotificationMode;
  mute_until: string | null;
  created_at: string;
  updated_at: string;
};

export type ModerationAuditLogRow = {
  id: string;
  action: string;
  actor_user_id: string | null;
  target_user_id: string | null;
  server_id: string | null;
  room_id: string | null;
  topic_id: string | null;
  message_id: string | null;
  meta: Record<string, unknown>;
  created_at: string;
};

export type AudioQuality = "retro" | "low" | "standard" | "high";

export type ServerMemberRole = "owner" | "admin" | "member";
export type ServerMemberStatus = "active" | "invited" | "left" | "removed";

export type ServerRow = {
  id: string;
  slug: string;
  name: string;
  owner_user_id: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type ServerMemberRow = {
  server_id: string;
  user_id: string;
  role: ServerMemberRole;
  status: ServerMemberStatus;
  joined_at: string;
  custom_role_ids?: string[];
};

export type ServerInviteRow = {
  id: string;
  server_id: string;
  token_hash: string;
  created_by_user_id: string | null;
  expires_at: string | null;
  max_uses: number | null;
  used_count: number;
  is_revoked: boolean;
  created_at: string;
};

export type ServerBanRow = {
  id: string;
  server_id: string;
  user_id: string;
  reason: string | null;
  banned_by_user_id: string | null;
  expires_at: string | null;
  created_at: string;
};

export type ServiceBanRow = {
  id: string;
  user_id: string;
  reason: string | null;
  banned_by_user_id: string | null;
  expires_at: string | null;
  created_at: string;
};

export type ServerAuditLogRow = {
  id: string;
  server_id: string | null;
  actor_user_id: string | null;
  target_user_id: string | null;
  action: string;
  meta: Record<string, unknown>;
  created_at: string;
};

export type ServerAgeConfirmationRow = {
  server_id: string;
  user_id: string;
  source: string | null;
  confirmed_at: string;
  created_at: string;
  updated_at: string;
};

export type ServerSettingsRow = {
  id: boolean;
  audio_quality: AudioQuality;
  updated_at: string;
  updated_by: string | null;
};

export type UserMemberPreferenceRow = {
  viewer_user_id: string;
  target_user_id: string;
  volume: number;
  note: string;
  updated_at: string;
};
