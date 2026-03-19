import { api } from "../api";
import type { Message, MessagesCursor, User } from "../domain";

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

  constructor(options: ChatControllerOptions) {
    this.options = options;
  }

  private normalizeMessageForRender(message: Message): Message {
    return message;
  }

  async loadRecentMessages(token: string, roomSlug: string) {
    try {
      const res = await api.roomMessages(token, roomSlug, { limit: 50 });
      this.options.setMessages(() => res.messages.map((message) => this.normalizeMessageForRender(message)));
      this.options.setMessagesHasMore(Boolean(res.pagination?.hasMore));
      this.options.setMessagesNextCursor(res.pagination?.nextCursor ?? null);
    } catch (error) {
      this.options.pushLog(`history failed: ${(error as Error).message}`);
    }
  }

  async loadOlderMessages(
    token: string,
    roomSlug: string,
    messagesNextCursor: MessagesCursor,
    loadingOlderMessages: boolean
  ) {
    if (loadingOlderMessages) {
      return;
    }

    this.options.setLoadingOlderMessages(true);
    try {
      const res = await api.roomMessages(token, roomSlug, {
        limit: 50,
        cursor: messagesNextCursor
      });

      this.options.setMessages((prev) => {
        const existingIds = new Set(prev.map((item) => item.id));
        const olderPage = res.messages
          .map((message) => this.normalizeMessageForRender(message))
          .filter((item) => !existingIds.has(item.id));
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

  sendMessage(
    textInput: string,
    roomSlug: string,
    user: User | null,
    maxChatRetries: number
  ) {
    const text = textInput.trim();
    if (!text) {
      return { sent: false as const };
    }

    const requestId = this.options.sendWsEvent(
      "chat.send",
      { text, roomSlug },
      { withIdempotency: true, maxRetries: maxChatRetries }
    );
    if (!requestId) {
      return { sent: false as const };
    }

    this.options.setMessages((prev) => [
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
    ]);

    void this.options.loadTelemetrySummary();
    return { sent: true as const };
  }
}