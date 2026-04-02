export type CallMicStateEventType = "call.mic_state";
export type CallVideoStateEventType = "call.video_state";
export type CallOfferEventType = "call.offer";
export type CallAnswerEventType = "call.answer";
export type CallIceEventType = "call.ice";
export type CallSignalEventType = CallOfferEventType | CallAnswerEventType | CallIceEventType;
export type CallEventType = CallSignalEventType | CallMicStateEventType | CallVideoStateEventType;

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

export type WsIncomingRoomMoveMemberEnvelope = {
  type: "room.move_member";
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

export type WsIncomingChatTypingEnvelope = {
  type: "chat.typing";
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

export type WsIncomingCallOfferEnvelope = {
  type: CallOfferEventType;
  requestId?: string;
  idempotencyKey?: string;
  payload?: WsIncomingPayload;
};

export type WsIncomingCallAnswerEnvelope = {
  type: CallAnswerEventType;
  requestId?: string;
  idempotencyKey?: string;
  payload?: WsIncomingPayload;
};

export type WsIncomingCallIceEnvelope = {
  type: CallIceEventType;
  requestId?: string;
  idempotencyKey?: string;
  payload?: WsIncomingPayload;
};

export type WsIncomingScreenShareStartEnvelope = {
  type: "screen.share.start";
  requestId?: string;
  idempotencyKey?: string;
  payload?: WsIncomingPayload;
};

export type WsIncomingScreenShareStopEnvelope = {
  type: "screen.share.stop";
  requestId?: string;
  idempotencyKey?: string;
  payload?: WsIncomingPayload;
};

export type WsIncomingKnownEnvelope =
  | WsIncomingPingEnvelope
  | WsIncomingRoomJoinEnvelope
  | WsIncomingRoomLeaveEnvelope
  | WsIncomingRoomKickEnvelope
  | WsIncomingRoomMoveMemberEnvelope
  | WsIncomingChatSendEnvelope
  | WsIncomingChatEditEnvelope
  | WsIncomingChatDeleteEnvelope
  | WsIncomingChatTypingEnvelope
  | WsIncomingCallOfferEnvelope
  | WsIncomingCallAnswerEnvelope
  | WsIncomingCallIceEnvelope
  | WsIncomingCallMicStateEnvelope
  | WsIncomingCallVideoStateEnvelope
  | WsIncomingScreenShareStartEnvelope
  | WsIncomingScreenShareStopEnvelope;

export type WsIncomingUnknownEnvelope = WsIncomingBaseEnvelope;

export type WsIncomingEnvelope = WsIncomingKnownEnvelope | WsIncomingUnknownEnvelope;

export type WsOutgoingEnvelope = {
  type: string;
  payload: Record<string, unknown>;
};

export type ChatAttachmentPayload = {
  id: string;
  type: "image";
  storageKey: string;
  downloadUrl: string | null;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  checksum: string | null;
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
  topicId?: string | null;
  topicSlug?: string | null;
  userId: string;
  userName: string;
  text: string;
  createdAt: string;
  senderRequestId: string | null;
  attachments?: ChatAttachmentPayload[];
};

export type ChatEditedPayload = {
  id: string;
  roomId: string;
  roomSlug: string | null;
  topicId?: string | null;
  topicSlug?: string | null;
  text: string;
  editedAt: string;
  editedByUserId: string;
};

export type ChatDeletedPayload = {
  id: string;
  roomId: string;
  roomSlug: string | null;
  topicId?: string | null;
  topicSlug?: string | null;
  deletedByUserId: string;
  ts: string;
};

export type ChatTypingPayload = {
  roomId: string;
  roomSlug: string;
  userId: string;
  userName: string;
  isTyping: boolean;
  ts: string;
};

export type MediaTopology = "livekit";

export type RealtimeCorrelationPayload = {
  requestId: string | null;
  sessionId: string;
  traceId: string;
};

export type RoomJoinedPayload = {
  roomId: string;
  roomSlug: string;
  roomTitle: string;
  mediaTopology: MediaTopology;
  correlation?: RealtimeCorrelationPayload;
  reconnect?: boolean;
};

export type RoomPresencePayload = {
  roomId: string;
  roomSlug: string;
  users: PresenceUser[];
  mediaTopology: MediaTopology;
  correlation?: RealtimeCorrelationPayload;
};

export type RoomLeftPayload = {
  roomId: string;
  roomSlug: string;
  correlation?: RealtimeCorrelationPayload;
};

export type PresenceJoinedPayload = {
  userId: string;
  userName: string;
  roomSlug: string;
  presenceCount: number;
  correlation?: RealtimeCorrelationPayload;
};

export type PresenceLeftPayload = {
  userId: string;
  userName: string;
  roomSlug: string | null;
  presenceCount: number;
  correlation?: RealtimeCorrelationPayload;
};

export type CallRelayBasePayload = {
  requestId: string | null;
  sessionId: string;
  traceId: string;
  fromUserId: string;
  fromUserName: string;
  roomId: string;
  roomSlug: string | null;
  targetUserId: string | null;
  ts: string;
};

export type CallMicStateRelayPayload = CallRelayBasePayload & {
  muted: boolean;
  speaking?: boolean;
  audioMuted?: boolean;
};

export type CallVideoStateRelayPayload = CallRelayBasePayload & {
  settings: Record<string, unknown>;
};

export type CallSignalRelayPayload = CallRelayBasePayload & {
  signal: Record<string, unknown>;
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
