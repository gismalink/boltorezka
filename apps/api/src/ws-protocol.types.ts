export type CallSignalEventType = "call.offer" | "call.answer" | "call.ice";
export type CallTerminalEventType = "call.reject" | "call.hangup";
export type CallEventType = CallSignalEventType | CallTerminalEventType;

export type WsIncomingEnvelope = {
  type: string;
  requestId?: string;
  idempotencyKey?: string;
  payload?: Record<string, unknown>;
};

export type WsOutgoingEnvelope = {
  type: string;
  payload: Record<string, unknown>;
};

export type PresenceUser = {
  userId: string;
  userName: string;
};

export type PongPayload = {
  ts: number;
};

export type ChatMessagePayload = {
  id: string;
  roomId: string;
  roomSlug: string | null;
  userId: string;
  userName: string;
  text: string;
  createdAt: string;
  senderRequestId: string | null;
};

export type RoomJoinedPayload = {
  roomId: string;
  roomSlug: string;
  roomTitle: string;
};

export type RoomPresencePayload = {
  roomId: string;
  roomSlug: string;
  users: PresenceUser[];
};

export type PresenceJoinedPayload = {
  userId: string;
  userName: string;
  roomSlug: string;
  presenceCount: number;
};

export type PresenceLeftPayload = {
  userId: string;
  userName: string;
  roomSlug: string | null;
  presenceCount: number;
};

export type CallRelayBasePayload = {
  fromUserId: string;
  fromUserName: string;
  roomId: string;
  roomSlug: string | null;
  targetUserId: string | null;
  ts: string;
};

export type CallSignalRelayPayload = CallRelayBasePayload & {
  signal: Record<string, unknown>;
};

export type CallTerminalRelayPayload = CallRelayBasePayload & {
  reason: string | null;
};
