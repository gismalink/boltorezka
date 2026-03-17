import type { Dispatch, SetStateAction } from "react";
import type { Message, PresenceMember, WsIncoming } from "../domain";
import { RTC_FEATURE_INITIAL_STATE_REPLAY } from "../hooks/rtc/voiceCallConfig";

type WsMessageControllerOptions = {
  clearPendingRequest: (requestId: string) => void;
  markMessageDelivery: (
    requestId: string,
    status: "sending" | "delivered" | "failed",
    patch?: Partial<Message>
  ) => void;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  pushLog: (text: string) => void;
  pushCallLog: (text: string) => void;
  pushToast: (message: string) => void;
  setRoomSlug: (slug: string) => void;
  onRoomMediaTopology?: (payload: { roomSlug: string; mediaTopology: "livekit" }) => void;
  setRoomsPresenceBySlug: Dispatch<SetStateAction<Record<string, string[]>>>;
  setRoomsPresenceDetailsBySlug: Dispatch<SetStateAction<Record<string, PresenceMember[]>>>;
  trackNack: (data: {
    requestId: string;
    eventType: string;
    code: string;
    message: string;
  }) => void;
  onCallNack?: (payload: { requestId: string; eventType: string; code: string; message: string }) => void;
  onCallMicState?: (
    payload: { fromUserId?: string; fromUserName?: string; muted?: boolean; speaking?: boolean; audioMuted?: boolean }
  ) => void;
  onCallVideoState?: (
    payload: {
      fromUserId?: string;
      fromUserName?: string;
      roomSlug?: string;
      settings?: Record<string, unknown>;
    }
  ) => void;
  onCallInitialState?: (
    payload: {
      roomSlug?: string;
      participants?: Array<{
        userId?: string;
        userName?: string;
        mic?: {
          muted?: boolean;
          speaking?: boolean;
          audioMuted?: boolean;
        };
        video?: {
          localVideoEnabled?: boolean;
        };
      }>;
    }
  ) => void;
  onAudioQualityUpdated?: (
    payload: {
      scope?: string;
      audioQuality?: string;
      roomId?: string;
      roomSlug?: string;
      audioQualityOverride?: string | null;
      updatedAt?: string;
      updatedByUserId?: string | null;
    }
  ) => void;
  onChatCleared?: (
    payload: {
      roomId?: string;
      roomSlug?: string;
      deletedCount?: number;
      clearedAt?: string;
    }
  ) => void;
  onAck?: (
    payload: { requestId: string; eventType: string; meta: Record<string, unknown> }
  ) => void;
  onNack?: (
    payload: { requestId: string; eventType: string; code: string; message: string }
  ) => void;
  onScreenShareState?: (
    payload: {
      roomId?: string;
      roomSlug?: string;
      active?: boolean;
      ownerUserId?: string | null;
      ownerUserName?: string | null;
      ts?: string;
    }
  ) => void;
  onSessionMoved?: (payload: { code: string; message: string }) => void;
  getActiveChatRoomSlug?: () => string;
};

export class WsMessageController {
  private readonly options: WsMessageControllerOptions;

  constructor(options: WsMessageControllerOptions) {
    this.options = options;
  }

  private asTrimmedString(value: unknown): string {
    return String(value || "").trim();
  }

  private asMediaTopology(value: unknown): "livekit" {
    void value;
    return "livekit";
  }

  private toPresenceMember(item: { userId?: string; userName?: string } | null | undefined): PresenceMember | null {
    const userId = this.asTrimmedString(item?.userId);
    const userName = this.asTrimmedString(item?.userName);
    if (!userId || !userName) {
      return null;
    }

    return { userId, userName };
  }

  private mapPresenceMembers(rawUsers: unknown): PresenceMember[] {
    if (!Array.isArray(rawUsers)) {
      return [];
    }

    return rawUsers
      .map((item) => this.toPresenceMember(item as { userId?: string; userName?: string }))
      .filter((item): item is PresenceMember => Boolean(item));
  }

  private buildDeliveredChatMessage(payload: Record<string, unknown>, fallbackId?: string): Message {
    return {
      id: String(payload.id || fallbackId || crypto.randomUUID()),
      room_id: String(payload.roomId || ""),
      user_id: String(payload.userId || ""),
      text: String(payload.text || ""),
      created_at: String(payload.createdAt || new Date().toISOString()),
      user_name: String(payload.userName || "unknown"),
      deliveryStatus: "delivered"
    };
  }

  /**
   * Processes transport-level acknowledgement and unblocks pending request state.
   */
  private handleAck(message: WsIncoming): void {
    const requestId = this.asTrimmedString(message.payload?.requestId);
    const eventType = this.asTrimmedString(message.payload?.eventType);
    if (!requestId) {
      return;
    }

    this.options.clearPendingRequest(requestId);
    if (eventType === "chat.send") {
      this.options.markMessageDelivery(requestId, "delivered", {
        id: String(message.payload?.messageId || requestId)
      });
    }

    this.options.onAck?.({
      requestId,
      eventType,
      meta: typeof message.payload === "object" && message.payload
        ? (message.payload as Record<string, unknown>)
        : {}
    });
  }

  /**
   * Processes negative acknowledgement and updates request/message state accordingly.
   */
  private handleNack(message: WsIncoming): void {
    const requestId = this.asTrimmedString(message.payload?.requestId);
    const eventType = this.asTrimmedString(message.payload?.eventType);
    const code = String(message.payload?.code || "UnknownError");
    const nackMessage = String(message.payload?.message || "Request failed");

    this.options.trackNack({
      requestId,
      eventType,
      code,
      message: nackMessage
    });

    if (requestId) {
      this.options.clearPendingRequest(requestId);
      if (eventType === "chat.send") {
        this.options.markMessageDelivery(requestId, "failed");
      }
    }

    this.options.pushLog(`nack ${eventType}: ${code} ${nackMessage}`);
    this.options.onNack?.({ requestId, eventType, code, message: nackMessage });
    if (eventType.startsWith("call.")) {
      this.options.pushCallLog(`nack ${eventType}: ${code} ${nackMessage}`);
      this.options.onCallNack?.({ requestId, eventType, code, message: nackMessage });
    }
  }

  private handleChatMessage(message: WsIncoming): void {
    if (!message.payload || typeof message.payload !== "object") {
      return;
    }

    const payload = message.payload as Record<string, unknown>;
    const senderRequestId = typeof payload.senderRequestId === "string" ? payload.senderRequestId : undefined;
    const incomingRoomSlug = this.asTrimmedString(payload.roomSlug || payload.room_slug);
    const activeChatRoomSlug = this.asTrimmedString(this.options.getActiveChatRoomSlug?.());
    if (incomingRoomSlug && activeChatRoomSlug && incomingRoomSlug !== activeChatRoomSlug) {
      if (!senderRequestId) {
        return;
      }

      this.options.clearPendingRequest(senderRequestId);
      this.options.markMessageDelivery(senderRequestId, "failed");
      this.options.setMessages((prev) => prev.filter((item) => item.clientRequestId !== senderRequestId));
      return;
    }

    if (!senderRequestId) {
      this.options.setMessages((prev) => [...prev, this.buildDeliveredChatMessage(payload)]);
      return;
    }

    this.options.clearPendingRequest(senderRequestId);
    let replaced = false;
    this.options.setMessages((prev) => {
      const next = prev.map((item) => {
        if (item.clientRequestId !== senderRequestId) {
          return item;
        }

        replaced = true;
        return {
          ...item,
          ...this.buildDeliveredChatMessage(payload, item.id)
        };
      });

      if (!replaced) {
        next.push(this.buildDeliveredChatMessage(payload));
      }

      return next;
    });
  }

  private handleChatEdited(message: WsIncoming): void {
    const messageId = this.asTrimmedString(message.payload?.id);
    if (!messageId) {
      return;
    }

    this.options.setMessages((prev) => prev.map((item) => {
      if (item.id !== messageId) {
        return item;
      }

      return {
        ...item,
        text: String(message.payload?.text || item.text),
        edited_at: String(message.payload?.editedAt || new Date().toISOString())
      };
    }));
  }

  private handleChatDeleted(message: WsIncoming): void {
    const messageId = this.asTrimmedString(message.payload?.id);
    if (!messageId) {
      return;
    }

    this.options.setMessages((prev) => prev.filter((item) => item.id !== messageId));
  }

  private handleChatCleared(message: WsIncoming): void {
    const roomId = this.asTrimmedString(message.payload?.roomId) || undefined;
    const roomSlug = this.asTrimmedString(message.payload?.roomSlug) || undefined;
    const deletedCountRaw = Number(message.payload?.deletedCount);
    const deletedCount = Number.isFinite(deletedCountRaw) ? Math.max(0, Math.round(deletedCountRaw)) : undefined;
    const clearedAt = this.asTrimmedString(message.payload?.clearedAt) || undefined;

    this.options.onChatCleared?.({
      roomId,
      roomSlug,
      deletedCount,
      clearedAt
    });
  }

  private handleScreenShareState(message: WsIncoming): void {
    this.options.onScreenShareState?.({
      roomId: this.asTrimmedString(message.payload?.roomId) || undefined,
      roomSlug: this.asTrimmedString(message.payload?.roomSlug) || undefined,
      active: typeof message.payload?.active === "boolean" ? message.payload.active : undefined,
      ownerUserId:
        typeof message.payload?.ownerUserId === "string"
          ? this.asTrimmedString(message.payload.ownerUserId)
          : message.payload?.ownerUserId === null
            ? null
            : undefined,
      ownerUserName:
        typeof message.payload?.ownerUserName === "string"
          ? this.asTrimmedString(message.payload.ownerUserName)
          : message.payload?.ownerUserName === null
            ? null
            : undefined,
      ts: typeof message.payload?.ts === "string" ? message.payload.ts : undefined
    });
  }

  private handleCallMicState(message: WsIncoming): void {
    if (message.type !== "call.mic_state") {
      return;
    }

    const fromUserName = String(message.payload?.fromUserName || message.payload?.fromUserId || "unknown");
    const mutedRaw = message.payload?.muted;
    const speakingRaw = message.payload?.speaking;
    const audioMutedRaw = message.payload?.audioMuted;

    if (typeof mutedRaw === "boolean") {
      this.options.pushCallLog(`call.mic_state from ${fromUserName}: ${mutedRaw ? "muted" : "unmuted"}`);
    }

    this.options.onCallMicState?.({
      fromUserId: this.asTrimmedString(message.payload?.fromUserId || message.payload?.userId) || undefined,
      fromUserName: this.asTrimmedString(message.payload?.fromUserName || message.payload?.userName) || undefined,
      muted: typeof mutedRaw === "boolean" ? mutedRaw : undefined,
      speaking: typeof speakingRaw === "boolean" ? speakingRaw : undefined,
      audioMuted: typeof audioMutedRaw === "boolean" ? audioMutedRaw : undefined
    });
  }

  private handleCallVideoState(message: WsIncoming): void {
    if (message.type !== "call.video_state") {
      return;
    }

    const fromUserName = String(message.payload?.fromUserName || message.payload?.fromUserId || "unknown");
    this.options.pushCallLog(`call.video_state from ${fromUserName}`);
    this.options.onCallVideoState?.({
      fromUserId: this.asTrimmedString(message.payload?.fromUserId || message.payload?.userId) || undefined,
      fromUserName: this.asTrimmedString(message.payload?.fromUserName || message.payload?.userName) || undefined,
      roomSlug: this.asTrimmedString(message.payload?.roomSlug) || undefined,
      settings:
        message.payload?.settings && typeof message.payload.settings === "object"
          ? (message.payload.settings as Record<string, unknown>)
          : undefined
    });
  }

  private handleCallInitialState(message: WsIncoming): void {
    if (!RTC_FEATURE_INITIAL_STATE_REPLAY) {
      this.options.pushCallLog("call.initial_state ignored (feature disabled)");
      return;
    }

    const roomSlug = this.asTrimmedString(message.payload?.roomSlug) || undefined;
    const participants: unknown[] = Array.isArray(message.payload?.participants)
      ? message.payload?.participants
      : [];

    const normalizedParticipants: Array<{
      userId?: string;
      userName?: string;
      mic?: { muted?: boolean; speaking?: boolean; audioMuted?: boolean };
      video?: { localVideoEnabled?: boolean };
    }> = [];

    for (const item of participants) {
      if (!item || typeof item !== "object") {
        continue;
      }

      const participant = item as {
        userId?: unknown;
        userName?: unknown;
        mic?: { muted?: unknown; speaking?: unknown; audioMuted?: unknown };
        video?: { localVideoEnabled?: unknown };
      };

      normalizedParticipants.push({
        userId: this.asTrimmedString(participant.userId) || undefined,
        userName: this.asTrimmedString(participant.userName) || undefined,
        mic: {
          muted: typeof participant.mic?.muted === "boolean" ? participant.mic.muted : undefined,
          speaking: typeof participant.mic?.speaking === "boolean" ? participant.mic.speaking : undefined,
          audioMuted: typeof participant.mic?.audioMuted === "boolean" ? participant.mic.audioMuted : undefined
        },
        video: {
          localVideoEnabled:
            typeof participant.video?.localVideoEnabled === "boolean"
              ? participant.video.localVideoEnabled
              : undefined
        }
      });
    }

    this.options.onCallInitialState?.({
      roomSlug,
      participants: normalizedParticipants
    });

    participants.forEach((item) => {
      if (!item || typeof item !== "object") {
        return;
      }

      const participant = item as {
        userId?: unknown;
        userName?: unknown;
        mic?: { muted?: unknown; speaking?: unknown; audioMuted?: unknown };
        video?: { localVideoEnabled?: unknown };
      };

      const fromUserId = this.asTrimmedString(participant.userId) || undefined;
      const fromUserName = this.asTrimmedString(participant.userName) || undefined;

      this.options.onCallMicState?.({
        fromUserId,
        fromUserName,
        muted: typeof participant.mic?.muted === "boolean" ? participant.mic.muted : undefined,
        speaking: typeof participant.mic?.speaking === "boolean" ? participant.mic.speaking : undefined,
        audioMuted: typeof participant.mic?.audioMuted === "boolean" ? participant.mic.audioMuted : undefined
      });

      this.options.onCallVideoState?.({
        fromUserId,
        fromUserName,
        roomSlug,
        settings: {
          localVideoEnabled:
            typeof participant.video?.localVideoEnabled === "boolean"
              ? participant.video.localVideoEnabled
              : false
        }
      });
    });

    this.options.pushCallLog(`call.initial_state replay (${participants.length})`);
  }

  private handleRoomPresence(message: WsIncoming): void {
    const roomSlug = this.asTrimmedString(message.payload?.roomSlug);
    if (!roomSlug) {
      return;
    }

    this.options.onRoomMediaTopology?.({
      roomSlug,
      mediaTopology: this.asMediaTopology(message.payload?.mediaTopology)
    });

    const users = this.mapPresenceMembers(message.payload?.users);
    this.options.setRoomsPresenceBySlug((prev) => ({
      ...prev,
      [roomSlug]: users.map((item) => item.userName)
    }));
    this.options.setRoomsPresenceDetailsBySlug((prev) => ({
      ...prev,
      [roomSlug]: users
    }));
  }

  private handleRoomsPresence(message: WsIncoming): void {
    const rooms = Array.isArray(message.payload?.rooms) ? message.payload.rooms : [];
    const next: Record<string, string[]> = {};
    const detailsNext: Record<string, PresenceMember[]> = {};

    rooms.forEach((room: { roomSlug?: string; users?: Array<{ userId?: string; userName?: string }> }) => {
      const roomSlug = this.asTrimmedString(room?.roomSlug);
      if (!roomSlug) {
        return;
      }

      this.options.onRoomMediaTopology?.({
        roomSlug,
        mediaTopology: this.asMediaTopology((room as { mediaTopology?: unknown }).mediaTopology)
      });

      const users = this.mapPresenceMembers(room?.users);
      next[roomSlug] = users.map((item) => item.userName);
      detailsNext[roomSlug] = users;
    });

    this.options.setRoomsPresenceBySlug(next);
    this.options.setRoomsPresenceDetailsBySlug(detailsNext);
  }

  private handleError(message: WsIncoming): void {
    const code = String(message.payload?.code || "ServerError");
    const errorMessage = String(message.payload?.message || "Unexpected websocket error");
    if (code === "ChannelSessionMoved" || code === "ChannelKicked") {
      this.options.setRoomSlug("");
      this.options.onSessionMoved?.({
        code,
        message: errorMessage
      });
    }
    this.options.pushToast(errorMessage);
    this.options.pushLog(`ws error ${code}: ${errorMessage}`);
  }

  private handleAudioQualityUpdated(message: WsIncoming): void {
    this.options.onAudioQualityUpdated?.({
      scope: typeof message.payload?.scope === "string" ? message.payload.scope : undefined,
      audioQuality: typeof message.payload?.audioQuality === "string" ? message.payload.audioQuality : undefined,
      roomId: typeof message.payload?.roomId === "string" ? message.payload.roomId : undefined,
      roomSlug: typeof message.payload?.roomSlug === "string" ? message.payload.roomSlug : undefined,
      audioQualityOverride: typeof message.payload?.audioQualityOverride === "string"
        ? message.payload.audioQualityOverride
        : message.payload?.audioQualityOverride === null
          ? null
          : undefined,
      updatedAt: typeof message.payload?.updatedAt === "string" ? message.payload.updatedAt : undefined,
      updatedByUserId: typeof message.payload?.updatedByUserId === "string"
        ? message.payload.updatedByUserId
        : message.payload?.updatedByUserId === null
          ? null
          : undefined
    });
    this.options.pushLog("audio quality policy updated via realtime");
  }

  /**
   * Routes websocket messages to dedicated typed handlers.
   */
  handle(message: WsIncoming) {
    switch (message.type) {
      case "ack":
        this.handleAck(message);
        return;
      case "nack":
        this.handleNack(message);
        return;
      case "chat.message":
        this.handleChatMessage(message);
        return;
      case "chat.edited":
        this.handleChatEdited(message);
        return;
      case "chat.deleted":
        this.handleChatDeleted(message);
        return;
      case "chat.cleared":
        this.handleChatCleared(message);
        return;
      case "screen.share.state":
        this.handleScreenShareState(message);
        return;
      case "call.mic_state":
        this.handleCallMicState(message);
        return;
      case "call.video_state":
        this.handleCallVideoState(message);
        return;
      case "call.initial_state":
        this.handleCallInitialState(message);
        return;
      case "room.joined":
      {
        const roomSlug = this.asTrimmedString(message.payload?.roomSlug);
        this.options.setRoomSlug(roomSlug);
        if (roomSlug) {
          this.options.onRoomMediaTopology?.({
            roomSlug,
            mediaTopology: this.asMediaTopology(message.payload?.mediaTopology)
          });
        }
        return;
      }
      case "room.presence":
        this.handleRoomPresence(message);
        return;
      case "rooms.presence":
        this.handleRoomsPresence(message);
        return;
      case "error":
        this.handleError(message);
        return;
      case "audio.quality.updated":
        this.handleAudioQualityUpdated(message);
        return;
      default:
        return;
    }
  }
}