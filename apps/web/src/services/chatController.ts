import { api } from "../api";
import type { Message, MessagesCursor, User } from "../domain";
import { trimMessagesInMemory } from "./chatMemory";

type WsSender = (
  eventType: string,
  payload: Record<string, unknown>,
  options?: { withIdempotency?: boolean; trackAck?: boolean; maxRetries?: number }
) => string | null;

type ChatControllerOptions = {
  pushLog: (text: string) => void;
  setMessages: (updater: (prev: Message[]) => Message[]) => void;
  setMessagesHasMore: (value: boolean) => void;
  setMessagesNextCursor: (cursor: MessagesCursor | null) => void;
  setLoadingOlderMessages: (value: boolean) => void;
  sendWsEvent: WsSender;
  loadTelemetrySummary: () => Promise<void>;
};

export class ChatController {
  private readonly options: ChatControllerOptions;
  private recentMessagesRequestId = 0;

  constructor(options: ChatControllerOptions) {
    this.options = options;
  }

  private normalizeMessageForRender(message: Message): Message {
    return message;
  }

  async loadRecentMessages(token: string, roomSlug: string, topicId: string | null = null) {
    const requestId = ++this.recentMessagesRequestId;
    try {
      const res = topicId
        ? await api.topicMessages(token, topicId, { limit: 50, aroundUnreadWindow: true })
        : await api.roomMessages(token, roomSlug, { limit: 50 });

      if (requestId !== this.recentMessagesRequestId) {
        return;
      }

      const unreadDividerMessageId = String(("unreadDividerMessageId" in res ? res.unreadDividerMessageId : "") || "").trim();
      this.options.setMessages(() => trimMessagesInMemory(
        res.messages.map((message) => this.normalizeMessageForRender({
          ...message,
          unread_divider_anchor: Boolean(unreadDividerMessageId && message.id === unreadDividerMessageId)
        }))
      ));
      this.options.setMessagesHasMore(Boolean(res.pagination?.hasMore));
      this.options.setMessagesNextCursor(res.pagination?.nextCursor ?? null);
    } catch (error) {
      if (requestId !== this.recentMessagesRequestId) {
        return;
      }

      this.options.pushLog(`history failed: ${(error as Error).message}`);
    }
  }

  async loadOlderMessages(
    token: string,
    roomSlug: string,
    topicId: string | null,
    messagesNextCursor: MessagesCursor,
    loadingOlderMessages: boolean
  ) {
    if (loadingOlderMessages) {
      return;
    }

    this.options.setLoadingOlderMessages(true);
    try {
      const res = topicId
        ? await api.topicMessages(token, topicId, {
          limit: 50,
          cursor: messagesNextCursor
        })
        : await api.roomMessages(token, roomSlug, {
          limit: 50,
          cursor: messagesNextCursor
        });

      this.options.setMessages((prev) => {
        const existingIds = new Set(prev.map((item) => item.id));
        const olderPage = res.messages
          .map((message) => this.normalizeMessageForRender(message))
          .filter((item) => !existingIds.has(item.id));

        // Keep explicit backward pagination lossless: user is browsing older history,
        // so dropping freshly loaded older pages makes pagination appear "stuck".
        return [...olderPage, ...prev];
      });

      this.options.setMessagesHasMore(Boolean(res.pagination?.hasMore));
      this.options.setMessagesNextCursor(res.pagination?.nextCursor ?? null);
    } catch (error) {
      this.options.pushLog(`load older failed: ${(error as Error).message}`);
    } finally {
      this.options.setLoadingOlderMessages(false);
    }
  }

  async loadMessagesAroundAnchor(
    token: string,
    roomSlug: string,
    topicId: string | null,
    anchorMessageId: string
  ): Promise<boolean> {
    const normalizedTopicId = String(topicId || "").trim();
    const normalizedAnchorMessageId = String(anchorMessageId || "").trim();
    if (!normalizedTopicId || !normalizedAnchorMessageId) {
      return false;
    }

    const requestId = ++this.recentMessagesRequestId;
    try {
      const res = await api.topicMessages(token, normalizedTopicId, {
        limit: 50,
        anchorMessageId: normalizedAnchorMessageId
      });

      if (requestId !== this.recentMessagesRequestId) {
        return false;
      }

      const unreadDividerMessageId = String(("unreadDividerMessageId" in res ? res.unreadDividerMessageId : "") || "").trim();
      this.options.setMessages(() => trimMessagesInMemory(
        res.messages.map((message) => this.normalizeMessageForRender({
          ...message,
          unread_divider_anchor: Boolean(unreadDividerMessageId && message.id === unreadDividerMessageId)
        }))
      ));
      this.options.setMessagesHasMore(Boolean(res.pagination?.hasMore));
      this.options.setMessagesNextCursor(res.pagination?.nextCursor ?? null);
      return true;
    } catch (error) {
      if (requestId === this.recentMessagesRequestId) {
        this.options.pushLog(`anchor load failed: ${(error as Error).message}`);
      }
      return false;
    }
  }

  sendMessage(
    textInput: string,
    roomSlug: string,
    user: User | null,
    maxChatRetries: number,
    mentionUserIds?: string[]
  ) {
    const text = textInput.trim();
    if (!text) {
      return { sent: false as const };
    }

    const requestId = this.options.sendWsEvent(
      "chat.send",
      {
        text,
        roomSlug,
        mentionUserIds: Array.isArray(mentionUserIds) && mentionUserIds.length > 0
          ? mentionUserIds
          : undefined
      },
      { withIdempotency: true, maxRetries: maxChatRetries }
    );
    if (!requestId) {
      return { sent: false as const };
    }

    this.options.setMessages((prev) => trimMessagesInMemory([
      ...prev,
      {
        id: requestId,
        room_id: "",
        user_id: user?.id || "",
        text,
        created_at: new Date().toISOString(),
        user_name: user?.name || "me",
        clientRequestId: requestId,
        deliveryStatus: "sending" as const
      }
    ]));

    void this.options.loadTelemetrySummary();
    return { sent: true as const };
  }
}