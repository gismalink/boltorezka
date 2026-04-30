import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { RefObject } from "react";
import { useChatPanelUnreadWindowExpand } from "./useChatPanelUnreadWindowExpand";

function makeNode({
  scrollHeight = 1000,
  clientHeight = 400,
  scrollTop = 0
}: { scrollHeight?: number; clientHeight?: number; scrollTop?: number } = {}) {
  const node = document.createElement("div");
  Object.defineProperty(node, "scrollHeight", { configurable: true, value: scrollHeight });
  Object.defineProperty(node, "clientHeight", { configurable: true, value: clientHeight });
  Object.defineProperty(node, "scrollTop", { configurable: true, writable: true, value: scrollTop });
  return node;
}

beforeEach(() => {
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    cb(0);
    return 1 as unknown as number;
  });
});

type Args = Parameters<typeof useChatPanelUnreadWindowExpand>[0];

function defaultArgs(overrides: Partial<Args> = {}): Args {
  const node = overrides.chatLogRef?.current ?? makeNode({ scrollHeight: 1000, clientHeight: 400, scrollTop: 600 });
  return {
    activeTopicId: "topic-a",
    hasActiveRoom: true,
    unreadDividerVisible: true,
    unreadDividerMessageId: "msg-1",
    loadedUnreadAfterDivider: 50,
    loadingOlderMessages: false,
    chatLogRef: { current: node } as RefObject<HTMLDivElement>,
    onLoadMessagesAroundAnchor: vi.fn().mockResolvedValue(true),
    ...overrides
  };
}

describe("useChatPanelUnreadWindowExpand", () => {
  it("does nothing when activeTopicId is empty", () => {
    const onLoad = vi.fn().mockResolvedValue(true);
    renderHook(() =>
      useChatPanelUnreadWindowExpand(
        defaultArgs({ activeTopicId: "", onLoadMessagesAroundAnchor: onLoad })
      )
    );
    expect(onLoad).not.toHaveBeenCalled();
  });

  it("does nothing when no active room", () => {
    const onLoad = vi.fn().mockResolvedValue(true);
    renderHook(() =>
      useChatPanelUnreadWindowExpand(
        defaultArgs({ hasActiveRoom: false, onLoadMessagesAroundAnchor: onLoad })
      )
    );
    expect(onLoad).not.toHaveBeenCalled();
  });

  it("does nothing when unread divider not visible", () => {
    const onLoad = vi.fn().mockResolvedValue(true);
    renderHook(() =>
      useChatPanelUnreadWindowExpand(
        defaultArgs({ unreadDividerVisible: false, onLoadMessagesAroundAnchor: onLoad })
      )
    );
    expect(onLoad).not.toHaveBeenCalled();
  });

  it("does nothing when divider message id is empty", () => {
    const onLoad = vi.fn().mockResolvedValue(true);
    renderHook(() =>
      useChatPanelUnreadWindowExpand(
        defaultArgs({ unreadDividerMessageId: "", onLoadMessagesAroundAnchor: onLoad })
      )
    );
    expect(onLoad).not.toHaveBeenCalled();
  });

  it("does nothing when not at bottom (distanceToBottom > 32)", () => {
    const onLoad = vi.fn().mockResolvedValue(true);
    const node = makeNode({ scrollHeight: 1000, clientHeight: 400, scrollTop: 100 });
    renderHook(() =>
      useChatPanelUnreadWindowExpand(
        defaultArgs({
          chatLogRef: { current: node } as RefObject<HTMLDivElement>,
          onLoadMessagesAroundAnchor: onLoad
        })
      )
    );
    expect(onLoad).not.toHaveBeenCalled();
  });

  it("does nothing when loadingOlderMessages is true", () => {
    const onLoad = vi.fn().mockResolvedValue(true);
    renderHook(() =>
      useChatPanelUnreadWindowExpand(
        defaultArgs({ loadingOlderMessages: true, onLoadMessagesAroundAnchor: onLoad })
      )
    );
    expect(onLoad).not.toHaveBeenCalled();
  });

  it("expands window when at bottom", async () => {
    const onLoad = vi.fn().mockResolvedValue(true);
    const node = makeNode({ scrollHeight: 1000, clientHeight: 400, scrollTop: 600 }); // distanceToBottom=0
    renderHook(() =>
      useChatPanelUnreadWindowExpand(
        defaultArgs({
          chatLogRef: { current: node } as RefObject<HTMLDivElement>,
          onLoadMessagesAroundAnchor: onLoad,
          loadedUnreadAfterDivider: 50
        })
      )
    );
    expect(onLoad).toHaveBeenCalledTimes(1);
    expect(onLoad).toHaveBeenCalledWith("topic-a", "msg-1", {
      aroundWindowBefore: 25,
      aroundWindowAfter: 100
    });
  });

  it("clamps requested window at UNREAD_WINDOW_EXPAND_MAX (500)", () => {
    const onLoad = vi.fn().mockResolvedValue(true);
    const node = makeNode({ scrollHeight: 1000, clientHeight: 400, scrollTop: 600 });
    renderHook(() =>
      useChatPanelUnreadWindowExpand(
        defaultArgs({
          chatLogRef: { current: node } as RefObject<HTMLDivElement>,
          onLoadMessagesAroundAnchor: onLoad,
          loadedUnreadAfterDivider: 480
        })
      )
    );
    expect(onLoad).toHaveBeenCalledWith("topic-a", "msg-1", {
      aroundWindowBefore: 25,
      aroundWindowAfter: 500
    });
  });
});
