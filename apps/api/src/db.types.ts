export type UserRole = "user" | "admin" | "super_admin";

export type UserRow = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  is_banned: boolean;
  created_at: string;
};

export type UserCompactRow = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  is_banned: boolean;
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
  user_name: string;
};

export type InsertedMessageRow = {
  id: string;
  room_id: string;
  user_id: string;
  body: string;
  created_at: string;
};
