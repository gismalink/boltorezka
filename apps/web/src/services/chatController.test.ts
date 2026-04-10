import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Message } from "../domain";
import { ChatController } from "./chatController";

const { topicMessagesMock } = vi.hoisted(() => ({
  topicMessagesMock: vi.fn()
}));

vi.mock("../api", () => ({
  api: {
    topicMessages: topicMessagesMock
  }
}));

function createMessage(id: string): Message {
  return {
    id,
    room_id: "room-1",
    topic_id: "topic-1",
    user_id: "user-1",
    text: "hello",
    created_at: new Date("2026-04-10T00:00:00.000Z").toISOString(),
    user_name: "User"
  };
}

function createController() {
  const pushLog = vi.fn();
  const setMessages = vi.fn();
  const setMessagesHasMore = vi.fn();
  const setMessagesNextCursor = vi.fn();
  const setLoadingOlderMessages = vi.fn();
  const sendWsEvent = vi.fn(() => null);
  const loadTelemetrySummary = vi.fn(async () => undefined);

  const controller = new ChatController({
    pushLog,
    setMessages,
    setMessagesHasMore,
    setMessagesNextCursor,
    setLoadingOlderMessages,
    sendWsEvent,
    loadTelemetrySummary
  });

  return {
    controller,
    pushLog,
    setMessages,
    setMessagesHasMore,
    setMessagesNextCursor
  };
}

describe("ChatController.loadMessagesAroundAnchor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forwards anchor and around-window options to api.topicMessages", async () => {
    const {
      controller,
      setMessages,
      setMessagesHasMore,
      setMessagesNextCursor
    } = createController();

    topicMessagesMock.mockResolvedValue({
      messages: [createMessage("m-1")],
      pagination: {
        hasMore: true,
        nextCursor: {
          beforeCreatedAt: new Date("2026-04-09T23:59:00.000Z").toISOString(),
          beforeId: "m-0"
        }
      },
      unreadDividerMessageId: "m-1"
    });

    const ok = await controller.loadMessagesAroundAnchor(
      "token",
      "general",
      "topic-1",
      "m-1",
      { aroundWindowBefore: 12, aroundWindowAfter: 8 }
    );

    expect(ok).toBe(true);
    expect(topicMessagesMock).toHaveBeenCalledWith("token", "topic-1", {
      limit: 50,
      anchorMessageId: "m-1",
      aroundWindowBefore: 12,
      aroundWindowAfter: 8
    });
    expect(setMessages).toHaveBeenCalledTimes(1);
    expect(setMessagesHasMore).toHaveBeenCalledWith(true);
    expect(setMessagesNextCursor).toHaveBeenCalledWith({
      beforeCreatedAt: new Date("2026-04-09T23:59:00.000Z").toISOString(),
      beforeId: "m-0"
    });
  });

  it("returns false and does not call API when topic or anchor is missing", async () => {
    const { controller } = createController();

    await expect(controller.loadMessagesAroundAnchor("token", "general", null, "m-1")).resolves.toBe(false);
    await expect(controller.loadMessagesAroundAnchor("token", "general", "topic-1", "")).resolves.toBe(false);
    expect(topicMessagesMock).not.toHaveBeenCalled();
  });

  it("returns false and logs when around-anchor fetch fails", async () => {
    const { controller, pushLog } = createController();
    topicMessagesMock.mockRejectedValue(new Error("boom"));

    const ok = await controller.loadMessagesAroundAnchor("token", "general", "topic-1", "m-1");

    expect(ok).toBe(false);
    expect(pushLog).toHaveBeenCalledWith("anchor load failed: boom");
  });
});