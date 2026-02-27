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
