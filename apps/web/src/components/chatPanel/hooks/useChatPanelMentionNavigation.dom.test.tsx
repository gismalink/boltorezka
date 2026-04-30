import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useChatPanelMentionNavigation } from "./useChatPanelMentionNavigation";

vi.mock("../../../api", () => ({
  api: {
    topicUnreadMentions: vi.fn(),
    roomTopics: vi.fn(),
    markNotificationInboxRead: vi.fn()
  }
}));

import { api } from "../../../api";

const apiMock = api as unknown as {
  topicUnreadMentions: ReturnType<typeof vi.fn>;
  roomTopics: ReturnType<typeof vi.fn>;
  markNotificationInboxRead: ReturnType<typeof vi.fn>;
};

type Args = Parameters<typeof useChatPanelMentionNavigation>[0];

function defaultArgs(overrides: Partial<Args> = {}): Args {
  return {
    authToken: "tok",
    roomId: "room-1",
    roomSlug: "room-slug",
    activeTopicId: "topic-a",
    topicMentionsActionLoading: false,
    setTopicMentionsActionLoading: vi.fn(),
    onConsumeTopicMentionUnread: vi.fn(),
    onSetTopicMentionUnreadLocal: vi.fn(),
    setSearchJumpStatusText: vi.fn(),
    setSearchJumpTarget: vi.fn(),
    t: (k: string) => k,
    ...overrides
  };
}

beforeEach(() => {
  apiMock.topicUnreadMentions.mockReset();
  apiMock.roomTopics.mockReset();
  apiMock.markNotificationInboxRead.mockReset();
});

describe("useChatPanelMentionNavigation", () => {
  it("returns early when authToken/roomSlug missing", async () => {
    const setLoading = vi.fn();
    const { result } = renderHook(() =>
      useChatPanelMentionNavigation(
        defaultArgs({ authToken: "", setTopicMentionsActionLoading: setLoading })
      )
    );
    await act(async () => {
      await result.current.jumpToNextTopicUnreadMention();
    });
    expect(setLoading).not.toHaveBeenCalled();
    expect(apiMock.topicUnreadMentions).not.toHaveBeenCalled();
  });

  it("returns early when already loading", async () => {
    const setLoading = vi.fn();
    const { result } = renderHook(() =>
      useChatPanelMentionNavigation(
        defaultArgs({ topicMentionsActionLoading: true, setTopicMentionsActionLoading: setLoading })
      )
    );
    await act(async () => {
      await result.current.jumpToNextTopicUnreadMention();
    });
    expect(setLoading).not.toHaveBeenCalled();
  });

  it("loads page and jumps to first mention; marks read & sets target", async () => {
    apiMock.topicUnreadMentions.mockResolvedValueOnce({
      items: [
        { id: "evt-1", messageId: "msg-1" },
        { id: "evt-2", messageId: "msg-2" }
      ],
      pagination: { hasMore: false, nextCursor: null }
    });
    apiMock.markNotificationInboxRead.mockResolvedValueOnce({ ok: true });

    const setSearchJumpTarget = vi.fn();
    const setSearchJumpStatusText = vi.fn();
    const onConsume = vi.fn();
    const setLoading = vi.fn();

    const { result } = renderHook(() =>
      useChatPanelMentionNavigation(
        defaultArgs({
          setSearchJumpTarget,
          setSearchJumpStatusText,
          onConsumeTopicMentionUnread: onConsume,
          setTopicMentionsActionLoading: setLoading
        })
      )
    );

    act(() => {
      result.current.resetForTopic("topic-a");
    });

    await act(async () => {
      await result.current.jumpToNextTopicUnreadMention();
    });

    expect(apiMock.topicUnreadMentions).toHaveBeenCalledWith("tok", "topic-a", {
      limit: 20,
      beforeCreatedAt: undefined,
      beforeId: undefined
    });
    expect(apiMock.markNotificationInboxRead).toHaveBeenCalledWith("tok", "evt-1");
    expect(onConsume).toHaveBeenCalledWith("topic-a");
    expect(setSearchJumpStatusText).toHaveBeenCalledWith("chat.topicMentionsJumping");
    expect(setSearchJumpTarget).toHaveBeenCalledWith({
      messageId: "msg-1",
      roomSlug: "room-slug",
      topicId: "topic-a",
      includeHistoryLoad: true
    });
    expect(setLoading).toHaveBeenNthCalledWith(1, true);
    expect(setLoading).toHaveBeenLastCalledWith(false);
  });

  it("reconciles mention count when no more mentions available", async () => {
    apiMock.topicUnreadMentions.mockResolvedValueOnce({
      items: [],
      pagination: { hasMore: false, nextCursor: null }
    });
    apiMock.roomTopics.mockResolvedValueOnce({
      topics: [{ id: "topic-a", mentionUnreadCount: 0 }]
    });

    const onSetLocal = vi.fn();
    const setSearchJumpTarget = vi.fn();

    const { result } = renderHook(() =>
      useChatPanelMentionNavigation(
        defaultArgs({
          onSetTopicMentionUnreadLocal: onSetLocal,
          setSearchJumpTarget
        })
      )
    );

    act(() => {
      result.current.resetForTopic("topic-a");
    });

    await act(async () => {
      await result.current.jumpToNextTopicUnreadMention();
    });

    expect(apiMock.roomTopics).toHaveBeenCalledWith("tok", "room-1");
    expect(onSetLocal).toHaveBeenCalledWith("topic-a", 0);
    expect(setSearchJumpTarget).not.toHaveBeenCalled();
    expect(apiMock.markNotificationInboxRead).not.toHaveBeenCalled();
  });

  it("consumes mentions sequentially across two pages with cursor", async () => {
    apiMock.topicUnreadMentions
      .mockResolvedValueOnce({
        items: [{ id: "evt-1", messageId: "msg-1" }],
        pagination: { hasMore: true, nextCursor: { beforeCreatedAt: "T", beforeId: "evt-1" } }
      })
      .mockResolvedValueOnce({
        items: [{ id: "evt-2", messageId: "msg-2" }],
        pagination: { hasMore: false, nextCursor: null }
      });
    apiMock.markNotificationInboxRead.mockResolvedValue({ ok: true });

    const setSearchJumpTarget = vi.fn();
    const { result } = renderHook(() =>
      useChatPanelMentionNavigation(defaultArgs({ setSearchJumpTarget }))
    );

    act(() => {
      result.current.resetForTopic("topic-a");
    });

    await act(async () => {
      await result.current.jumpToNextTopicUnreadMention();
    });
    expect(setSearchJumpTarget).toHaveBeenLastCalledWith(
      expect.objectContaining({ messageId: "msg-1" })
    );

    await act(async () => {
      await result.current.jumpToNextTopicUnreadMention();
    });
    // Second jump must load page 2 with cursor and consume evt-2
    expect(apiMock.topicUnreadMentions).toHaveBeenNthCalledWith(2, "tok", "topic-a", {
      limit: 20,
      beforeCreatedAt: "T",
      beforeId: "evt-1"
    });
    expect(setSearchJumpTarget).toHaveBeenLastCalledWith(
      expect.objectContaining({ messageId: "msg-2" })
    );
  });

  it("ignores load result when topic changed mid-flight (resetForTopic to empty)", async () => {
    let resolvePage: (value: unknown) => void = () => {};
    apiMock.topicUnreadMentions.mockImplementationOnce(
      () => new Promise((resolve) => { resolvePage = resolve; })
    );

    const setSearchJumpTarget = vi.fn();
    const { result } = renderHook(() =>
      useChatPanelMentionNavigation(defaultArgs({ setSearchJumpTarget }))
    );

    act(() => {
      result.current.resetForTopic("topic-a");
    });

    let jumpPromise!: Promise<void>;
    act(() => {
      jumpPromise = result.current.jumpToNextTopicUnreadMention();
    });

    // Switch topic before page resolves
    act(() => {
      result.current.resetForTopic("topic-b");
    });

    await act(async () => {
      resolvePage({
        items: [{ id: "evt-1", messageId: "msg-1" }],
        pagination: { hasMore: false, nextCursor: null }
      });
      await jumpPromise;
    });

    // Items must not have been queued (topic mismatch), so jump should not target msg-1.
    expect(setSearchJumpTarget).not.toHaveBeenCalled();
  });

  it("filters out items without eventId or messageId", async () => {
    apiMock.topicUnreadMentions.mockResolvedValueOnce({
      items: [
        { id: "", messageId: "msg-x" },
        { id: "evt-y", messageId: "" },
        { id: "evt-z", messageId: "msg-z" }
      ],
      pagination: { hasMore: false, nextCursor: null }
    });
    apiMock.markNotificationInboxRead.mockResolvedValueOnce({ ok: true });

    const setSearchJumpTarget = vi.fn();
    const { result } = renderHook(() =>
      useChatPanelMentionNavigation(defaultArgs({ setSearchJumpTarget }))
    );

    act(() => {
      result.current.resetForTopic("topic-a");
    });

    await act(async () => {
      await result.current.jumpToNextTopicUnreadMention();
    });

    expect(setSearchJumpTarget).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: "msg-z" })
    );
  });

  it("reconcile: ignores roomTopics failure silently", async () => {
    apiMock.topicUnreadMentions.mockResolvedValueOnce({
      items: [],
      pagination: { hasMore: false, nextCursor: null }
    });
    apiMock.roomTopics.mockRejectedValueOnce(new Error("network"));

    const onSetLocal = vi.fn();
    const setLoading = vi.fn();
    const { result } = renderHook(() =>
      useChatPanelMentionNavigation(
        defaultArgs({
          onSetTopicMentionUnreadLocal: onSetLocal,
          setTopicMentionsActionLoading: setLoading
        })
      )
    );

    act(() => {
      result.current.resetForTopic("topic-a");
    });

    await act(async () => {
      await result.current.jumpToNextTopicUnreadMention();
    });

    expect(onSetLocal).not.toHaveBeenCalled();
    expect(setLoading).toHaveBeenLastCalledWith(false);
  });
});
