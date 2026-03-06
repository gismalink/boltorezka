export type CallSignalEventType = "call.offer" | "call.answer" | "call.ice";
export type CallTerminalEventType = "call.reject" | "call.hangup";
export type CallMicStateEventType = "call.mic_state";
export type CallVideoStateEventType = "call.video_state";
export type CallEventType = CallSignalEventType | CallTerminalEventType | CallMicStateEventType | CallVideoStateEventType;

export type WsIncomingPayload = Record<string, unknown>;

export type WsIncomingBaseEnvelope = {
  type: string;
  requestId?: string;
  idempotencyKey?: string;
  payload?: WsIncomingPayload;
};

export type WsIncomingPingEnvelope = {
  type: "ping";
  requestId?: string;
  idempotencyKey?: string;
  payload?: WsIncomingPayload;
};

export type WsIncomingRoomJoinEnvelope = {
  type: "room.join";
  requestId?: string;
  idempotencyKey?: string;
  payload?: WsIncomingPayload;
};

export type WsIncomingRoomLeaveEnvelope = {
  type: "room.leave";
  requestId?: string;
  idempotencyKey?: string;
  payload?: WsIncomingPayload;
};

export type WsIncomingRoomKickEnvelope = {
  type: "room.kick";
  requestId?: string;
  idempotencyKey?: string;
  payload?: WsIncomingPayload;
};

export type WsIncomingChatSendEnvelope = {
  type: "chat.send";
  requestId?: string;
  idempotencyKey?: string;
  payload?: WsIncomingPayload;
};

export type WsIncomingChatEditEnvelope = {
  type: "chat.edit";
  requestId?: string;
  idempotencyKey?: string;
  payload?: WsIncomingPayload;
};

export type WsIncomingChatDeleteEnvelope = {
  type: "chat.delete";
  requestId?: string;
  idempotencyKey?: string;
  payload?: WsIncomingPayload;
};

export type WsIncomingCallSignalEnvelope = {
  type: CallSignalEventType;
  requestId?: string;
  idempotencyKey?: string;
  payload?: WsIncomingPayload;
};

export type WsIncomingCallTerminalEnvelope = {
  type: CallTerminalEventType;
  requestId?: string;
  idempotencyKey?: string;
  payload?: WsIncomingPayload;
};

export type WsIncomingCallMicStateEnvelope = {
  type: CallMicStateEventType;
  requestId?: string;
  idempotencyKey?: string;
  payload?: WsIncomingPayload;
};

export type WsIncomingCallVideoStateEnvelope = {
  type: CallVideoStateEventType;
  requestId?: string;
  idempotencyKey?: string;
  payload?: WsIncomingPayload;
};

export type WsIncomingKnownEnvelope =
  | WsIncomingPingEnvelope
  | WsIncomingRoomJoinEnvelope
  | WsIncomingRoomLeaveEnvelope
  | WsIncomingRoomKickEnvelope
  | WsIncomingChatSendEnvelope
  | WsIncomingChatEditEnvelope
  | WsIncomingChatDeleteEnvelope
  | WsIncomingCallSignalEnvelope
  | WsIncomingCallTerminalEnvelope
  | WsIncomingCallMicStateEnvelope
  | WsIncomingCallVideoStateEnvelope;

export type WsIncomingUnknownEnvelope = WsIncomingBaseEnvelope;

export type WsIncomingEnvelope = WsIncomingKnownEnvelope | WsIncomingUnknownEnvelope;

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

export type ChatEditedPayload = {
  id: string;
  roomId: string;
  roomSlug: string | null;
  text: string;
  editedAt: string;
  editedByUserId: string;
};

export type ChatDeletedPayload = {
  id: string;
  roomId: string;
  roomSlug: string | null;
  deletedByUserId: string;
  ts: string;
};

export type MediaTopology = "p2p" | "sfu";

export type RoomJoinedPayload = {
  roomId: string;
  roomSlug: string;
  roomTitle: string;
  mediaTopology: MediaTopology;
};

export type RoomPresencePayload = {
  roomId: string;
  roomSlug: string;
  users: PresenceUser[];
  mediaTopology: MediaTopology;
};

export type RoomLeftPayload = {
  roomId: string;
  roomSlug: string;
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

export type CallMicStateRelayPayload = CallRelayBasePayload & {
  muted: boolean;
  speaking?: boolean;
  audioMuted?: boolean;
};

export type CallVideoStateRelayPayload = CallRelayBasePayload & {
  settings: Record<string, unknown>;
};

export type CallInitialStateParticipantPayload = {
  userId: string;
  userName: string;
  mic: {
    muted: boolean;
    speaking: boolean;
    audioMuted: boolean;
  };
  video: {
    localVideoEnabled: boolean;
  };
};

export type CallInitialStatePayload = {
  roomId: string;
  roomSlug: string;
  participants: CallInitialStateParticipantPayload[];
};
