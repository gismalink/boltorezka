export type AuthModeResponse = {
  mode: string;
  ssoBaseUrl: string;
};

export type User = {
  id: string;
  email: string;
  name: string;
  role: "user" | "admin" | "super_admin";
  created_at: string;
};

export type Room = {
  id: string;
  slug: string;
  title: string;
  is_public: boolean;
  created_at: string;
  is_member?: boolean;
};

export type Message = {
  id: string;
  room_id: string;
  user_id: string;
  text: string;
  created_at: string;
  user_name: string;
};

export type WsIncoming = {
  type: string;
  payload?: any;
};
