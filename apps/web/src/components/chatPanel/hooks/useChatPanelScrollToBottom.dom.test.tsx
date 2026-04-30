import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { createRef, RefObject } from "react";
import { useChatPanelScrollToBottom } from "./useChatPanelScrollToBottom";

function makeNode({
  scrollHeight = 1000,
  clientHeight = 400,
  scrollTop = 0
}: { scrollHeight?: number; clientHeight?: number; scrollTop?: number } = {}) {
  const node = document.createElement("div");
  Object.defineProperty(node, "scrollHeight", { configurable: true, value: scrollHeight });
  Object.defineProperty(node, "clientHeight", { configurable: true, value: clientHeight });
  Object.defineProperty(node, "scrollTop", { configurable: true, writable: true, value: scrollTop });
  node.scrollTo = vi.fn();
  return node;
}

beforeEach(() => {
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    cb(0);
    return 1 as unknown as number;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
});

describe("useChatPanelScrollToBottom", () => {
  it("hides button when no active room", () => {
    const node = makeNode({ scrollTop: 0 });
    const ref = { current: node } as RefObject<HTMLDivElement>;
    const { result } = renderHook(() =>
      useChatPanelScrollToBottom({ chatLogRef: ref, hasActiveRoom: false, messagesLength: 10, loadingOlderMessages: false })
    );
    expect(result.current.showScrollToBottomButton).toBe(false);
  });

  it("shows button when scrolled away from bottom", () => {
    const node = makeNode({ scrollHeight: 1000, clientHeight: 400, scrollTop: 100 });
    const ref = { current: node } as RefObject<HTMLDivElement>;
    const { result } = renderHook(() =>
      useChatPanelScrollToBottom({ chatLogRef: ref, hasActiveRoom: true, messagesLength: 10, loadingOlderMessages: false })
    );
    expect(result.current.showScrollToBottomButton).toBe(true);
  });

  it("hides button when at bottom", () => {
    const node = makeNode({ scrollHeight: 1000, clientHeight: 400, scrollTop: 600 });
    const ref = { current: node } as RefObject<HTMLDivElement>;
    const { result } = renderHook(() =>
      useChatPanelScrollToBottom({ chatLogRef: ref, hasActiveRoom: true, messagesLength: 10, loadingOlderMessages: false })
    );
    expect(result.current.showScrollToBottomButton).toBe(false);
  });

  it("hides button when content is not scrollable", () => {
    const node = makeNode({ scrollHeight: 400, clientHeight: 400, scrollTop: 0 });
    const ref = { current: node } as RefObject<HTMLDivElement>;
    const { result } = renderHook(() =>
      useChatPanelScrollToBottom({ chatLogRef: ref, hasActiveRoom: true, messagesLength: 10, loadingOlderMessages: false })
    );
    expect(result.current.showScrollToBottomButton).toBe(false);
  });

  it("scrollTimelineToBottom calls scrollTo on node", () => {
    const node = makeNode({ scrollHeight: 1500, clientHeight: 400, scrollTop: 0 });
    const ref = { current: node } as RefObject<HTMLDivElement>;
    const { result } = renderHook(() =>
      useChatPanelScrollToBottom({ chatLogRef: ref, hasActiveRoom: true, messagesLength: 10, loadingOlderMessages: false })
    );
    act(() => {
      result.current.scrollTimelineToBottom();
    });
    expect(node.scrollTo).toHaveBeenCalledWith({ top: 1500, behavior: "smooth" });
  });

  it("scrollTimelineToBottom is no-op when ref is null", () => {
    const ref = createRef<HTMLDivElement>();
    const { result } = renderHook(() =>
      useChatPanelScrollToBottom({ chatLogRef: ref, hasActiveRoom: true, messagesLength: 0, loadingOlderMessages: false })
    );
    expect(() => result.current.scrollTimelineToBottom()).not.toThrow();
  });

  it("updates visibility on scroll event", () => {
    const node = makeNode({ scrollHeight: 1000, clientHeight: 400, scrollTop: 600 });
    const ref = { current: node } as RefObject<HTMLDivElement>;
    const { result } = renderHook(() =>
      useChatPanelScrollToBottom({ chatLogRef: ref, hasActiveRoom: true, messagesLength: 10, loadingOlderMessages: false })
    );
    expect(result.current.showScrollToBottomButton).toBe(false);

    act(() => {
      Object.defineProperty(node, "scrollTop", { configurable: true, writable: true, value: 100 });
      node.dispatchEvent(new Event("scroll"));
    });
    expect(result.current.showScrollToBottomButton).toBe(true);
  });
});
