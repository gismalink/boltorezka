import type { Dispatch, SetStateAction } from "react";
import type { Message, PresenceMember, RoomTopic, WsIncoming } from "../domain";
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
  onChatTyping?: (
    payload: {
      roomId?: string;
      roomSlug?: string;
      userId?: string;
      userName?: string;
      isTyping?: boolean;
      ts?: string;
    }
  ) => void;
  onChatMessagePinned?: (
    payload: {
      roomId?: string;
      roomSlug?: string;
      topicId?: string;
      topicSlug?: string;
      messageId?: string;
      pinned?: boolean;
      pinnedByUserId?: string;
      ts?: string;
    }
  ) => void;
  onChatMessageUnpinned?: (
    payload: {
      roomId?: string;
      roomSlug?: string;
      topicId?: string;
      topicSlug?: string;
      messageId?: string;
      pinned?: boolean;
      unpinnedByUserId?: string;
      ts?: string;
    }
  ) => void;
  onChatMessageReactionChanged?: (
    payload: {
      roomId?: string;
      roomSlug?: string;
      topicId?: string;
      topicSlug?: string;
      messageId?: string;
      emoji?: string;
      userId?: string;
      active?: boolean;
      ts?: string;
    }
  ) => void;
  onChatMessageReceived?: (
    payload: {
      roomId?: string;
      roomSlug?: string;
      topicId?: string;
      topicSlug?: string;
      messageId?: string;
      userId?: string;
      userName?: string;
      createdAt?: string;
      senderRequestId?: string;
    }
  ) => void;
  onChatTopicRead?: (
    payload: {
      roomId?: string;
      topicId?: string;
      userId?: string;
      lastReadMessageId?: string;
      lastReadAt?: string;
    }
  ) => void;
  onChatTopicCreated?: (
    payload: {
      roomId?: string;
      roomSlug?: string;
      topic?: RoomTopic;
      actorUserId?: string;
      ts?: string;
    }
  ) => void;
  onChatTopicUpdated?: (
    payload: {
      roomId?: string;
      roomSlug?: string;
      topic?: RoomTopic;
      actorUserId?: string;
      ts?: string;
    }
  ) => void;
  onChatTopicArchived?: (
    payload: {
      roomId?: string;
      roomSlug?: string;
      topic?: RoomTopic;
      actorUserId?: string;
      ts?: string;
    }
  ) => void;
  onChatTopicUnarchived?: (
    payload: {
      roomId?: string;
      roomSlug?: string;
      topic?: RoomTopic;
      actorUserId?: string;
      ts?: string;
    }
  ) => void;
  onNotificationSettingsUpdated?: (
    payload: {
      settings?: {
        id: string;
        userId: string;
        scopeType: "server" | "room" | "topic";
        serverId: string | null;
        roomId: string | null;
        topicId: string | null;
        mode: "all" | "mentions" | "none";
        muteUntil: string | null;
        allowCriticalMentions: boolean;
        createdAt: string;
        updatedAt: string;
      };
      ts?: string;
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
  getActiveTopicId?: () => string | null;
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
    const attachmentsRaw = Array.isArray(payload.attachments)
      ? payload.attachments
      : [];

    const attachments = attachmentsRaw
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
      .map((item) => {
        const attachmentType = String(item.type || "").trim().toLowerCase();
        return {
          id: String(item.id || crypto.randomUUID()),
          message_id: String(item.messageId || item.message_id || payload.id || fallbackId || ""),
          type: attachmentType === "audio" || attachmentType === "document" ? attachmentType : "image",
          storage_key: String(item.storageKey || item.storage_key || ""),
          download_url: item.downloadUrl === null || item.download_url === null
            ? null
            : String(item.downloadUrl || item.download_url || ""),
          mime_type: String(item.mimeType || item.mime_type || ""),
          size_bytes: Number(item.sizeBytes || item.size_bytes || 0),
          width: typeof item.width === "number" ? item.width : null,
          height: typeof item.height === "number" ? item.height : null,
          checksum: item.checksum === null ? null : String(item.checksum || "") || null,
          created_at: String(item.createdAt || item.created_at || new Date().toISOString())
        };
      })
      .filter((item) => item.storage_key && item.mime_type && Number.isFinite(item.size_bytes) && item.size_bytes > 0);

    return {
      id: String(payload.id || fallbackId || crypto.randomUUID()),
      room_id: String(payload.roomId || ""),
      topic_id: typeof payload.topicId === "string"
        ? payload.topicId
        : payload.topicId === null
          ? null
          : null,
      reply_to_message_id: typeof payload.replyToMessageId === "string"
        ? payload.replyToMessageId
        : payload.replyToMessageId === null
          ? null
          : null,
      reply_to_user_id: typeof payload.replyToUserId === "string"
        ? payload.replyToUserId
        : payload.replyToUserId === null
          ? null
          : null,
      reply_to_user_name: typeof payload.replyToUserName === "string"
        ? payload.replyToUserName
        : payload.replyToUserName === null
          ? null
          : null,
      reply_to_text: typeof payload.replyToText === "string"
        ? payload.replyToText
        : payload.replyToText === null
          ? null
          : null,
      user_id: String(payload.userId || ""),
      text: String(payload.text || ""),
      created_at: String(payload.createdAt || new Date().toISOString()),
      user_name: String(payload.userName || "unknown"),
      attachments,
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
    const incomingTopicId = this.asTrimmedString(payload.topicId || payload.topic_id);
    this.options.onChatMessageReceived?.({
      roomId: this.asTrimmedString(payload.roomId || payload.room_id) || undefined,
      roomSlug: incomingRoomSlug || undefined,
      topicId: incomingTopicId || undefined,
      topicSlug: this.asTrimmedString(payload.topicSlug || payload.topic_slug) || undefined,
      messageId: this.asTrimmedString(payload.id) || undefined,
      userId: this.asTrimmedString(payload.userId || payload.user_id) || undefined,
      userName: this.asTrimmedString(payload.userName || payload.user_name) || undefined,
      createdAt: this.asTrimmedString(payload.createdAt || payload.created_at) || undefined,
      senderRequestId
    });
    const activeChatRoomSlug = this.asTrimmedString(this.options.getActiveChatRoomSlug?.());
    const activeTopicId = this.asTrimmedString(this.options.getActiveTopicId?.());
    if (incomingRoomSlug && activeChatRoomSlug && incomingRoomSlug !== activeChatRoomSlug) {
      if (!senderRequestId) {
        return;
      }

      this.options.clearPendingRequest(senderRequestId);
      this.options.markMessageDelivery(senderRequestId, "failed");
      this.options.setMessages((prev) => prev.filter((item) => item.clientRequestId !== senderRequestId));
      return;
    }

    if (activeTopicId) {
      if (!incomingTopicId || incomingTopicId !== activeTopicId) {
        return;
      }
    }

    if (!senderRequestId) {
      const delivered = this.buildDeliveredChatMessage(payload);
      this.options.setMessages((prev) => {
        if (prev.some((item) => item.id === delivered.id)) {
          return prev;
        }

        return [...prev, delivered];
      });
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

  private handleChatTyping(message: WsIncoming): void {
    this.options.onChatTyping?.({
      roomId: this.asTrimmedString(message.payload?.roomId) || undefined,
      roomSlug: this.asTrimmedString(message.payload?.roomSlug) || undefined,
      userId: this.asTrimmedString(message.payload?.userId) || undefined,
      userName: this.asTrimmedString(message.payload?.userName) || undefined,
      isTyping: typeof message.payload?.isTyping === "boolean" ? message.payload.isTyping : undefined,
      ts: this.asTrimmedString(message.payload?.ts) || undefined
    });
  }

  private handleChatMessagePinned(message: WsIncoming): void {
    this.options.onChatMessagePinned?.({
      roomId: this.asTrimmedString(message.payload?.roomId) || undefined,
      roomSlug: this.asTrimmedString(message.payload?.roomSlug) || undefined,
      topicId: this.asTrimmedString(message.payload?.topicId) || undefined,
      topicSlug: this.asTrimmedString(message.payload?.topicSlug) || undefined,
      messageId: this.asTrimmedString(message.payload?.messageId) || undefined,
      pinned: typeof message.payload?.pinned === "boolean" ? message.payload.pinned : undefined,
      pinnedByUserId: this.asTrimmedString(message.payload?.pinnedByUserId) || undefined,
      ts: this.asTrimmedString(message.payload?.ts) || undefined
    });
  }

  private handleChatMessageUnpinned(message: WsIncoming): void {
    this.options.onChatMessageUnpinned?.({
      roomId: this.asTrimmedString(message.payload?.roomId) || undefined,
      roomSlug: this.asTrimmedString(message.payload?.roomSlug) || undefined,
      topicId: this.asTrimmedString(message.payload?.topicId) || undefined,
      topicSlug: this.asTrimmedString(message.payload?.topicSlug) || undefined,
      messageId: this.asTrimmedString(message.payload?.messageId) || undefined,
      pinned: typeof message.payload?.pinned === "boolean" ? message.payload.pinned : undefined,
      unpinnedByUserId: this.asTrimmedString(message.payload?.unpinnedByUserId) || undefined,
      ts: this.asTrimmedString(message.payload?.ts) || undefined
    });
  }

  private handleChatMessageReactionChanged(message: WsIncoming): void {
    this.options.onChatMessageReactionChanged?.({
      roomId: this.asTrimmedString(message.payload?.roomId) || undefined,
      roomSlug: this.asTrimmedString(message.payload?.roomSlug) || undefined,
      topicId: this.asTrimmedString(message.payload?.topicId) || undefined,
      topicSlug: this.asTrimmedString(message.payload?.topicSlug) || undefined,
      messageId: this.asTrimmedString(message.payload?.messageId) || undefined,
      emoji: this.asTrimmedString(message.payload?.emoji) || undefined,
      userId: this.asTrimmedString(message.payload?.userId) || undefined,
      active: typeof message.payload?.active === "boolean" ? message.payload.active : undefined,
      ts: this.asTrimmedString(message.payload?.ts) || undefined
    });
  }

  private handleChatTopicRead(message: WsIncoming): void {
    this.options.onChatTopicRead?.({
      roomId: this.asTrimmedString(message.payload?.roomId) || undefined,
      topicId: this.asTrimmedString(message.payload?.topicId) || undefined,
      userId: this.asTrimmedString(message.payload?.userId) || undefined,
      lastReadMessageId: this.asTrimmedString(message.payload?.lastReadMessageId) || undefined,
      lastReadAt: this.asTrimmedString(message.payload?.lastReadAt) || undefined
    });
  }

  private toTopicPayload(raw: unknown): RoomTopic | undefined {
    if (!raw || typeof raw !== "object") {
      return undefined;
    }

    const topic = raw as Record<string, unknown>;
    const id = this.asTrimmedString(topic.id);
    const roomId = this.asTrimmedString(topic.roomId);
    if (!id || !roomId) {
      return undefined;
    }

    return {
      id,
      roomId,
      createdBy: typeof topic.createdBy === "string" ? topic.createdBy : null,
      slug: this.asTrimmedString(topic.slug),
      title: String(topic.title || "").trim(),
      position: Number(topic.position || 0),
      isPinned: Boolean(topic.isPinned),
      archivedAt: typeof topic.archivedAt === "string" ? topic.archivedAt : null,
      createdAt: String(topic.createdAt || new Date().toISOString()),
      updatedAt: String(topic.updatedAt || new Date().toISOString()),
      unreadCount: Number(topic.unreadCount || 0),
      mentionUnreadCount: Number(topic.mentionUnreadCount || 0)
    };
  }

  private handleChatTopicCreated(message: WsIncoming): void {
    this.options.onChatTopicCreated?.({
      roomId: this.asTrimmedString(message.payload?.roomId) || undefined,
      roomSlug: this.asTrimmedString(message.payload?.roomSlug) || undefined,
      topic: this.toTopicPayload(message.payload?.topic),
      actorUserId: this.asTrimmedString(message.payload?.actorUserId) || undefined,
      ts: this.asTrimmedString(message.payload?.ts) || undefined
    });
  }

  private handleChatTopicUpdated(message: WsIncoming): void {
    this.options.onChatTopicUpdated?.({
      roomId: this.asTrimmedString(message.payload?.roomId) || undefined,
      roomSlug: this.asTrimmedString(message.payload?.roomSlug) || undefined,
      topic: this.toTopicPayload(message.payload?.topic),
      actorUserId: this.asTrimmedString(message.payload?.actorUserId) || undefined,
      ts: this.asTrimmedString(message.payload?.ts) || undefined
    });
  }

  private handleChatTopicArchived(message: WsIncoming): void {
    this.options.onChatTopicArchived?.({
      roomId: this.asTrimmedString(message.payload?.roomId) || undefined,
      roomSlug: this.asTrimmedString(message.payload?.roomSlug) || undefined,
      topic: this.toTopicPayload(message.payload?.topic),
      actorUserId: this.asTrimmedString(message.payload?.actorUserId) || undefined,
      ts: this.asTrimmedString(message.payload?.ts) || undefined
    });
  }

  private handleChatTopicUnarchived(message: WsIncoming): void {
    this.options.onChatTopicUnarchived?.({
      roomId: this.asTrimmedString(message.payload?.roomId) || undefined,
      roomSlug: this.asTrimmedString(message.payload?.roomSlug) || undefined,
      topic: this.toTopicPayload(message.payload?.topic),
      actorUserId: this.asTrimmedString(message.payload?.actorUserId) || undefined,
      ts: this.asTrimmedString(message.payload?.ts) || undefined
    });
  }

  private handleNotificationSettingsUpdated(message: WsIncoming): void {
    const settingsRaw = message.payload?.settings;
    if (!settingsRaw || typeof settingsRaw !== "object") {
      return;
    }

    const settings = settingsRaw as Record<string, unknown>;
    const id = this.asTrimmedString(settings.id);
    const userId = this.asTrimmedString(settings.userId);
    const scopeType = this.asTrimmedString(settings.scopeType) as "server" | "room" | "topic";
    const mode = this.asTrimmedString(settings.mode) as "all" | "mentions" | "none";

    if (!id || !userId || !scopeType || !mode) {
      return;
    }

    this.options.onNotificationSettingsUpdated?.({
      settings: {
        id,
        userId,
        scopeType,
        serverId: typeof settings.serverId === "string" ? settings.serverId : null,
        roomId: typeof settings.roomId === "string" ? settings.roomId : null,
        topicId: typeof settings.topicId === "string" ? settings.topicId : null,
        mode,
        muteUntil: typeof settings.muteUntil === "string" ? settings.muteUntil : null,
        allowCriticalMentions: settings.allowCriticalMentions !== false,
        createdAt: String(settings.createdAt || new Date().toISOString()),
        updatedAt: String(settings.updatedAt || new Date().toISOString())
      },
      ts: this.asTrimmedString(message.payload?.ts) || undefined
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
      case "chat.message.created":
        this.handleChatMessage(message);
        return;
      case "chat.edited":
      case "chat.message.updated":
        this.handleChatEdited(message);
        return;
      case "chat.deleted":
      case "chat.message.deleted":
        this.handleChatDeleted(message);
        return;
      case "chat.cleared":
        this.handleChatCleared(message);
        return;
      case "chat.typing":
        this.handleChatTyping(message);
        return;
      case "chat.message.pinned":
        this.handleChatMessagePinned(message);
        return;
      case "chat.message.unpinned":
        this.handleChatMessageUnpinned(message);
        return;
      case "chat.message.reaction.changed":
        this.handleChatMessageReactionChanged(message);
        return;
      case "chat.topic.read":
        this.handleChatTopicRead(message);
        return;
      case "chat.topic.created":
        this.handleChatTopicCreated(message);
        return;
      case "chat.topic.updated":
        this.handleChatTopicUpdated(message);
        return;
      case "chat.topic.archived":
        this.handleChatTopicArchived(message);
        return;
      case "chat.topic.unarchived":
        this.handleChatTopicUnarchived(message);
        return;
      case "chat.notification.settings.updated":
        this.handleNotificationSettingsUpdated(message);
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