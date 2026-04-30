import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useChatPanelInboxNotifications } from "./useChatPanelInboxNotifications";

vi.mock("../../../api", () => ({
  api: {
    notificationInbox: vi.fn(),
    markNotificationInboxRead: vi.fn(),
    markNotificationInboxReadAll: vi.fn(),
    notificationPushPublicKey: vi.fn().mockResolvedValue({ enabled: false, publicKey: "" }),
    upsertNotificationPushSubscription: vi.fn(),
    notificationUnreadCount: vi.fn().mockResolvedValue({ unreadCount: 0 })
  }
}));

vi.mock("../../../desktopBridge", () => ({
  getDesktopNotificationBridge: () => null
}));

import { api } from "../../../api";

const apiMock = api as unknown as {
  notificationInbox: ReturnType<typeof vi.fn>;
  markNotificationInboxRead: ReturnType<typeof vi.fn>;
  markNotificationInboxReadAll: ReturnType<typeof vi.fn>;
  notificationPushPublicKey: ReturnType<typeof vi.fn>;
  notificationUnreadCount: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  apiMock.notificationInbox.mockReset();
  apiMock.markNotificationInboxRead.mockReset();
  apiMock.markNotificationInboxReadAll.mockReset();
  apiMock.notificationPushPublicKey.mockReset().mockResolvedValue({ enabled: false, publicKey: "" });
  apiMock.notificationUnreadCount.mockReset().mockResolvedValue({ unreadCount: 0 });
  window.localStorage.clear();
});

function makeItem(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "evt-1",
    title: "Title",
    body: "Body",
    createdAt: "2026-04-30T10:00:00Z",
    readAt: null,
    messageId: "msg-1",
    topicId: "topic-1",
    payload: { roomSlug: "room-x" },
    priority: "normal",
    ...over
  };
}

describe("useChatPanelInboxNotifications", () => {
  it("loadInbox: maps items and exposes them via inboxItems", async () => {
    apiMock.notificationInbox.mockResolvedValue({ items: [makeItem()] });

    const { result } = renderHook(() =>
      useChatPanelInboxNotifications({
        authToken: "tok",
        roomSlug: "room-x",
        activeTopicId: "topic-1",
        onJumpToMessage: vi.fn(),
        onResetJumpStatus: vi.fn()
      })
    );

    await waitFor(() => {
      expect(result.current.inboxItems).toHaveLength(1);
    });
    expect(result.current.inboxItems[0]).toMatchObject({
      id: "evt-1",
      title: "Title",
      body: "Body",
      messageId: "msg-1",
      topicId: "topic-1",
      roomSlug: "room-x",
      priority: "normal",
      readAt: null
    });
  });

  it("loadInbox: noop when authToken empty", async () => {
    const { result } = renderHook(() =>
      useChatPanelInboxNotifications({
        authToken: "",
        roomSlug: "room-x",
        activeTopicId: null,
        onJumpToMessage: vi.fn(),
        onResetJumpStatus: vi.fn()
      })
    );
    await act(async () => {
      await result.current.loadInbox();
    });
    expect(apiMock.notificationInbox).not.toHaveBeenCalled();
    expect(result.current.inboxItems).toEqual([]);
  });

  it("markInboxAllRead: marks all unread items as readAt now", async () => {
    apiMock.notificationInbox.mockResolvedValue({
      items: [
        makeItem({ id: "evt-1", readAt: null }),
        makeItem({ id: "evt-2", readAt: "2026-01-01T00:00:00Z" })
      ]
    });
    apiMock.markNotificationInboxReadAll.mockResolvedValue({ ok: true });

    const { result } = renderHook(() =>
      useChatPanelInboxNotifications({
        authToken: "tok",
        roomSlug: "room-x",
        activeTopicId: null,
        onJumpToMessage: vi.fn(),
        onResetJumpStatus: vi.fn()
      })
    );

    await waitFor(() => expect(result.current.inboxItems).toHaveLength(2));

    await act(async () => {
      await result.current.markInboxAllRead();
    });

    expect(apiMock.markNotificationInboxReadAll).toHaveBeenCalledWith("tok");
    const items = result.current.inboxItems;
    expect(items[0].readAt).not.toBeNull();
    // Existing readAt must be preserved
    expect(items[1].readAt).toBe("2026-01-01T00:00:00Z");
  });

  it("openInboxItem: jumps using item from cache and marks read", async () => {
    apiMock.notificationInbox.mockResolvedValue({
      items: [makeItem({ id: "evt-1", messageId: "msg-9" })]
    });
    apiMock.markNotificationInboxRead.mockResolvedValue({ ok: true });

    const onJump = vi.fn();
    const onReset = vi.fn();
    const { result } = renderHook(() =>
      useChatPanelInboxNotifications({
        authToken: "tok",
        roomSlug: "room-x",
        activeTopicId: "topic-1",
        onJumpToMessage: onJump,
        onResetJumpStatus: onReset
      })
    );

    await waitFor(() => expect(result.current.inboxItems).toHaveLength(1));

    await act(async () => {
      await result.current.openInboxItem("evt-1");
    });

    expect(onReset).toHaveBeenCalled();
    expect(onJump).toHaveBeenCalledWith({
      messageId: "msg-9",
      roomSlug: "room-x",
      topicId: "topic-1",
      includeHistoryLoad: false
    });
    expect(apiMock.markNotificationInboxRead).toHaveBeenCalledWith("tok", "evt-1");
  });

  it("openInboxItem: no-op when item lacks messageId or roomSlug", async () => {
    apiMock.notificationInbox.mockResolvedValue({
      items: [makeItem({ id: "evt-1", messageId: null })]
    });
    const onJump = vi.fn();

    const { result } = renderHook(() =>
      useChatPanelInboxNotifications({
        authToken: "tok",
        roomSlug: "room-x",
        activeTopicId: null,
        onJumpToMessage: onJump,
        onResetJumpStatus: vi.fn()
      })
    );

    await waitFor(() => expect(result.current.inboxItems).toHaveLength(1));

    await act(async () => {
      await result.current.openInboxItem("evt-1");
    });
    expect(onJump).not.toHaveBeenCalled();
  });

  it("openInboxItem: refetches inbox when item not in cache", async () => {
    apiMock.notificationInbox.mockResolvedValue({ items: [] });
    apiMock.markNotificationInboxRead.mockResolvedValue({ ok: true });

    const onJump = vi.fn();
    const { result } = renderHook(() =>
      useChatPanelInboxNotifications({
        authToken: "tok",
        roomSlug: "room-x",
        activeTopicId: null,
        onJumpToMessage: onJump,
        onResetJumpStatus: vi.fn()
      })
    );

    await waitFor(() => expect(result.current.inboxItems).toEqual([]));

    const callsBefore = apiMock.notificationInbox.mock.calls.length;
    apiMock.notificationInbox.mockResolvedValueOnce({
      items: [makeItem({ id: "evt-42", messageId: "msg-42" })]
    });

    await act(async () => {
      await result.current.openInboxItem("evt-42");
    });

    const callsAfter = apiMock.notificationInbox.mock.calls.length;
    expect(callsAfter).toBeGreaterThan(callsBefore);
    expect(apiMock.notificationInbox).toHaveBeenLastCalledWith("tok", { limit: 50 });
    expect(onJump).toHaveBeenCalledWith(expect.objectContaining({ messageId: "msg-42" }));
  });

  it("hydrates notified eventIds from localStorage (does not throw on bad JSON)", () => {
    window.localStorage.setItem("boltorezka:notified-inbox-events", "{not json");
    apiMock.notificationInbox.mockResolvedValue({ items: [] });

    expect(() => {
      renderHook(() =>
        useChatPanelInboxNotifications({
          authToken: "tok",
          roomSlug: "",
          activeTopicId: null,
          onJumpToMessage: vi.fn(),
          onResetJumpStatus: vi.fn()
        })
      );
    }).not.toThrow();
  });
});
