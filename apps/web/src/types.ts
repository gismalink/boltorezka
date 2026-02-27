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
  clientRequestId?: string;
  deliveryStatus?: "sending" | "delivered" | "failed";
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
  };
};
