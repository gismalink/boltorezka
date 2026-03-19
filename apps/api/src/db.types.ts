export type UserRole = "user" | "admin" | "super_admin";
export type UserAccessState = "pending" | "active" | "blocked";
export type UiTheme = "8-neon-bit" | "material-classic";

export type UserRow = {
  id: string;
  email: string;
  username: string | null;
  name: string;
  ui_theme: UiTheme;
  role: UserRole;
  is_banned: boolean;
  access_state: UserAccessState;
  is_bot: boolean;
  created_at: string;
};

export type UserCompactRow = {
  id: string;
  email: string;
  username: string | null;
  name: string;
  ui_theme: UiTheme;
  role: UserRole;
  is_banned: boolean;
  access_state: UserAccessState;
  is_bot: boolean;
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
  audio_quality_override?: AudioQuality | null;
  category_id: string | null;
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
  user_id: string;
  body: string;
  created_at: string;
};

export type AudioQuality = "retro" | "low" | "standard" | "high";

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
