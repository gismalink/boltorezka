import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useChatPanelSearch } from "./useChatPanelSearch";

vi.mock("../../../api", () => ({
  api: {
    searchMessages: vi.fn()
  }
}));

import { api } from "../../../api";

const apiMock = api as unknown as {
  searchMessages: ReturnType<typeof vi.fn>;
};

type Args = Parameters<typeof useChatPanelSearch>[0];

const stableT = (k: string) => k;
const stableTopics = [{ id: "topic-1", title: "Topic 1" }] as Args["topics"];

function defaultArgs(overrides: Partial<Args> = {}): Args {
  return {
    t: stableT,
    authToken: "tok",
    currentServerId: "srv-1",
    roomId: "room-1",
    roomSlug: "room-slug",
    activeTopicId: "topic-1",
    topics: stableTopics,
    loadingOlderMessages: false,
    messagesHasMore: true,
    onOpenRoomChat: vi.fn(),
    onSelectTopic: vi.fn(),
    onLoadOlderMessages: vi.fn(),
    onLoadMessagesAroundAnchor: vi.fn().mockResolvedValue(true),
    ...overrides
  };
}

beforeEach(() => {
  apiMock.searchMessages.mockReset();
  apiMock.searchMessages.mockResolvedValue({ messages: [], pagination: { hasMore: false } });
});

describe("useChatPanelSearch", () => {
  it("handleSearchMessages: noop when query empty", async () => {
    const { result } = renderHook(() => useChatPanelSearch(defaultArgs()));
    await act(async () => {
      await result.current.handleSearchMessages();
    });
    expect(apiMock.searchMessages).not.toHaveBeenCalled();
  });

  it("handleSearchMessages: noop when authToken empty", async () => {
    const { result } = renderHook(() => useChatPanelSearch(defaultArgs({ authToken: "" })));
    act(() => result.current.setSearchQuery("hello"));
    await act(async () => {
      await result.current.handleSearchMessages();
    });
    expect(apiMock.searchMessages).not.toHaveBeenCalled();
  });

  it("handleSearchMessages: builds request, maps results, sets hasMore", async () => {
    apiMock.searchMessages.mockResolvedValueOnce({
      messages: [
        {
          id: "m1",
          roomSlug: "rs",
          roomTitle: "RT",
          topicId: "t1",
          topicTitle: "T1",
          userName: "u",
          text: "hello world",
          createdAt: "2026-04-30T10:00:00Z",
          hasAttachments: false
        }
      ],
      pagination: { hasMore: true }
    });

    const { result } = renderHook(() => useChatPanelSearch(defaultArgs()));
    act(() => {
      result.current.setSearchQuery("hello");
      result.current.setSearchScope("server");
      result.current.setSearchHasMention(true);
      result.current.setSearchHasAttachment(true);
      result.current.setSearchAttachmentType("image");
      result.current.setSearchHasLink(true);
      result.current.setSearchAuthorId("user-1");
    });

    await act(async () => {
      await result.current.handleSearchMessages();
    });

    expect(apiMock.searchMessages).toHaveBeenCalledWith("tok", expect.objectContaining({
      q: "hello",
      scope: "server",
      serverId: "srv-1",
      roomId: undefined,
      hasMention: true,
      hasAttachment: true,
      attachmentType: "image",
      hasLink: true,
      authorId: "user-1",
      limit: 25
    }));
    expect(result.current.searchResults).toHaveLength(1);
    expect(result.current.searchResults[0]).toMatchObject({ id: "m1", text: "hello world" });
    expect(result.current.searchResultsHasMore).toBe(true);
  });

  it("handleSearchMessages: room scope passes roomId, not serverId", async () => {
    apiMock.searchMessages.mockResolvedValue({ messages: [], pagination: { hasMore: false } });
    const { result } = renderHook(() => useChatPanelSearch(defaultArgs()));
    act(() => {
      result.current.setSearchQuery("foo");
      result.current.setSearchScope("room");
    });
    await act(async () => {
      await result.current.handleSearchMessages();
    });
    expect(apiMock.searchMessages).toHaveBeenCalledWith("tok", expect.objectContaining({
      scope: "room",
      roomId: "room-1",
      serverId: undefined
    }));
  });

  it("handleSearchMessages: normalizes invalid date filters to undefined", async () => {
    const { result } = renderHook(() => useChatPanelSearch(defaultArgs()));
    act(() => {
      result.current.setSearchQuery("q");
      result.current.setSearchFrom("not-a-date");
      result.current.setSearchTo("2026-01-15");
    });
    await act(async () => {
      await result.current.handleSearchMessages();
    });

    const callArg = apiMock.searchMessages.mock.calls.at(-1)?.[1] as Record<string, unknown>;
    expect(callArg.from).toBeUndefined();
    expect(typeof callArg.to).toBe("string");
    expect(callArg.to).toMatch(/2026-01-15/);
  });

  it("handleSearchMessages: sets searchError on api failure", async () => {
    apiMock.searchMessages.mockRejectedValueOnce(new Error("boom"));
    const { result } = renderHook(() => useChatPanelSearch(defaultArgs()));
    act(() => {
      result.current.setSearchQuery("err");
    });
    await act(async () => {
      await result.current.handleSearchMessages();
    });
    expect(result.current.searchError).toBe("chat.searchError");
    expect(result.current.searchResults).toEqual([]);
  });

  it("clears results when query becomes empty", async () => {
    apiMock.searchMessages.mockResolvedValue({
      messages: [{
        id: "m1", roomSlug: "rs", roomTitle: "RT", topicId: null, topicTitle: null,
        userName: "u", text: "x", createdAt: "2026-04-30T10:00:00Z", hasAttachments: false
      }],
      pagination: { hasMore: false }
    });
    const { result } = renderHook(() => useChatPanelSearch(defaultArgs()));
    act(() => result.current.setSearchQuery("hello"));
    await act(async () => {
      await result.current.handleSearchMessages();
    });
    expect(result.current.searchResults).toHaveLength(1);

    act(() => result.current.setSearchQuery(""));
    await waitFor(() => expect(result.current.searchResults).toEqual([]));
    expect(result.current.searchError).toBe("");
  });

  it("setSearchJumpTarget: opens different room chat when slug differs", async () => {
    const onOpenRoomChat = vi.fn();
    const { result } = renderHook(() =>
      useChatPanelSearch(defaultArgs({ onOpenRoomChat }))
    );

    act(() => {
      result.current.setSearchJumpTarget({
        messageId: "msg-x",
        roomSlug: "other-room",
        topicId: null
      });
    });

    await waitFor(() => expect(onOpenRoomChat).toHaveBeenCalledWith("other-room"));
  });

  it("setSearchJumpTarget: selects different topic in same room", async () => {
    const onSelectTopic = vi.fn();
    const { result } = renderHook(() =>
      useChatPanelSearch(defaultArgs({
        onSelectTopic,
        topics: [
          { id: "topic-1", title: "T1" },
          { id: "topic-2", title: "T2" }
        ] as Args["topics"]
      }))
    );

    act(() => {
      result.current.setSearchJumpTarget({
        messageId: "msg-y",
        roomSlug: "room-slug",
        topicId: "topic-2"
      });
    });

    await waitFor(() => expect(onSelectTopic).toHaveBeenCalledWith("topic-2"));
  });

  it("setSearchJumpTarget: triggers onLoadMessagesAroundAnchor when target topic active and message not in DOM", async () => {
    const onLoadAround = vi.fn().mockResolvedValue(true);
    const { result } = renderHook(() =>
      useChatPanelSearch(defaultArgs({ onLoadMessagesAroundAnchor: onLoadAround }))
    );

    act(() => {
      result.current.setSearchJumpTarget({
        messageId: "msg-not-in-dom",
        roomSlug: "room-slug",
        topicId: "topic-1"
      });
    });

    await waitFor(() => {
      expect(onLoadAround).toHaveBeenCalledWith("topic-1", "msg-not-in-dom", expect.objectContaining({
        aroundWindowBefore: 24,
        aroundWindowAfter: 24
      }));
    });
  });

  it("setSearchJumpTarget: scrolls to message when present in DOM and clears target", async () => {
    const node = document.createElement("div");
    node.setAttribute("data-message-id", "msg-here");
    node.scrollIntoView = vi.fn();
    document.body.appendChild(node);

    const { result } = renderHook(() => useChatPanelSearch(defaultArgs()));

    act(() => {
      result.current.setSearchJumpTarget({
        messageId: "msg-here",
        roomSlug: "room-slug",
        topicId: "topic-1"
      });
    });

    await waitFor(() => {
      expect(node.scrollIntoView).toHaveBeenCalled();
    });
    expect(node.classList.contains("chat-message-jump-target")).toBe(true);

    document.body.removeChild(node);
  });
});
