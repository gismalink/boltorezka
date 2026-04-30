import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { RefObject } from "react";
import { useChatTopLazyLoad } from "./useChatTopLazyLoad";

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
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useChatTopLazyLoad", () => {
  it("does nothing when no active room", () => {
    const node = makeNode({ scrollTop: 0, scrollHeight: 1000, clientHeight: 400 });
    const ref = { current: node } as RefObject<HTMLDivElement>;
    const onLoadOlderMessages = vi.fn();

    renderHook(() =>
      useChatTopLazyLoad({
        chatLogRef: ref,
        hasActiveRoom: false,
        messageCount: 10,
        loadingOlderMessages: false,
        messagesHasMore: true,
        onLoadOlderMessages
      })
    );
    expect(onLoadOlderMessages).not.toHaveBeenCalled();
  });

  it("loads older on initial check when content is short", () => {
    const node = makeNode({ scrollHeight: 400, clientHeight: 400, scrollTop: 0 });
    const ref = { current: node } as RefObject<HTMLDivElement>;
    const onLoadOlderMessages = vi.fn();

    renderHook(() =>
      useChatTopLazyLoad({
        chatLogRef: ref,
        hasActiveRoom: true,
        messageCount: 10,
        loadingOlderMessages: false,
        messagesHasMore: true,
        onLoadOlderMessages
      })
    );
    expect(onLoadOlderMessages).toHaveBeenCalledTimes(1);
  });

  it("loads older on initial check when scrollTop near top even if content tall", () => {
    const node = makeNode({ scrollHeight: 5000, clientHeight: 400, scrollTop: 0 });
    const ref = { current: node } as RefObject<HTMLDivElement>;
    const onLoadOlderMessages = vi.fn();

    renderHook(() =>
      useChatTopLazyLoad({
        chatLogRef: ref,
        hasActiveRoom: true,
        messageCount: 10,
        loadingOlderMessages: false,
        messagesHasMore: true,
        onLoadOlderMessages
      })
    );
    expect(onLoadOlderMessages).toHaveBeenCalledTimes(1);
  });

  it("does not load on initial check when overflow large and not at top", () => {
    const node = makeNode({ scrollHeight: 5000, clientHeight: 400, scrollTop: 500 });
    const ref = { current: node } as RefObject<HTMLDivElement>;
    const onLoadOlderMessages = vi.fn();

    renderHook(() =>
      useChatTopLazyLoad({
        chatLogRef: ref,
        hasActiveRoom: true,
        messageCount: 10,
        loadingOlderMessages: false,
        messagesHasMore: true,
        onLoadOlderMessages
      })
    );
    expect(onLoadOlderMessages).not.toHaveBeenCalled();
  });

  it("does not load on initial check if loading or no more messages", () => {
    const node = makeNode({ scrollHeight: 400, clientHeight: 400, scrollTop: 0 });
    const ref = { current: node } as RefObject<HTMLDivElement>;
    const onLoadOlderMessages = vi.fn();

    renderHook(() =>
      useChatTopLazyLoad({
        chatLogRef: ref,
        hasActiveRoom: true,
        messageCount: 10,
        loadingOlderMessages: true,
        messagesHasMore: true,
        onLoadOlderMessages
      })
    );
    expect(onLoadOlderMessages).not.toHaveBeenCalled();

    onLoadOlderMessages.mockClear();
    renderHook(() =>
      useChatTopLazyLoad({
        chatLogRef: ref,
        hasActiveRoom: true,
        messageCount: 10,
        loadingOlderMessages: false,
        messagesHasMore: false,
        onLoadOlderMessages
      })
    );
    expect(onLoadOlderMessages).not.toHaveBeenCalled();
  });

  it("ignores untrusted scroll events", () => {
    const node = makeNode({ scrollHeight: 5000, clientHeight: 400, scrollTop: 500 });
    const ref = { current: node } as RefObject<HTMLDivElement>;
    const onLoadOlderMessages = vi.fn();

    renderHook(() =>
      useChatTopLazyLoad({
        chatLogRef: ref,
        hasActiveRoom: true,
        messageCount: 10,
        loadingOlderMessages: false,
        messagesHasMore: true,
        onLoadOlderMessages
      })
    );
    onLoadOlderMessages.mockClear();

    Object.defineProperty(node, "scrollTop", { configurable: true, writable: true, value: 0 });
    node.dispatchEvent(new Event("scroll")); // isTrusted = false in jsdom
    expect(onLoadOlderMessages).not.toHaveBeenCalled();
  });

  it("removes scroll listener on unmount", () => {
    const node = makeNode({ scrollHeight: 5000, clientHeight: 400, scrollTop: 500 });
    const removeSpy = vi.spyOn(node, "removeEventListener");
    const ref = { current: node } as RefObject<HTMLDivElement>;
    const onLoadOlderMessages = vi.fn();

    const { unmount } = renderHook(() =>
      useChatTopLazyLoad({
        chatLogRef: ref,
        hasActiveRoom: true,
        messageCount: 10,
        loadingOlderMessages: false,
        messagesHasMore: true,
        onLoadOlderMessages
      })
    );

    unmount();
    expect(removeSpy).toHaveBeenCalledWith("scroll", expect.any(Function));
  });
});
