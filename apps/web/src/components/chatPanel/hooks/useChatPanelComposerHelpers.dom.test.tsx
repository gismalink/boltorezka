import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useChatPanelComposerHelpers } from "./useChatPanelComposerHelpers";

describe("useChatPanelComposerHelpers", () => {
  it("formatMessageTime: returns localized HH:MM and empty string for invalid", () => {
    const onSetChatText = vi.fn();
    const { result } = renderHook(() =>
      useChatPanelComposerHelpers({ locale: "en-GB", chatText: "", onSetChatText })
    );

    const formatted = result.current.formatMessageTime("2026-01-02T03:04:05Z");
    expect(formatted).toMatch(/\d{2}:\d{2}/);

    expect(result.current.formatMessageTime("not-a-date")).toBe("");
  });

  it("formatAttachmentSize: delegates to formatAttachmentSizeValue", () => {
    const { result } = renderHook(() =>
      useChatPanelComposerHelpers({ locale: "en", chatText: "", onSetChatText: vi.fn() })
    );

    expect(result.current.formatAttachmentSize(0)).toBe("0 B");
    expect(result.current.formatAttachmentSize(2048)).toBe("2.0 KB");
  });

  it("insertMentionToComposer: appends @name with proper separator and ignores empty", () => {
    const onSetChatText = vi.fn();
    const { result, rerender } = renderHook(
      ({ chatText }) =>
        useChatPanelComposerHelpers({ locale: "en", chatText, onSetChatText }),
      { initialProps: { chatText: "" } }
    );

    act(() => {
      result.current.insertMentionToComposer("alice");
    });
    expect(onSetChatText).toHaveBeenLastCalledWith("@alice ");

    rerender({ chatText: "hello" });
    act(() => {
      result.current.insertMentionToComposer("bob");
    });
    expect(onSetChatText).toHaveBeenLastCalledWith("hello @bob ");

    onSetChatText.mockClear();
    act(() => {
      result.current.insertMentionToComposer("   ");
    });
    expect(onSetChatText).not.toHaveBeenCalled();
  });

  it("insertQuoteToComposer: appends quoted lines", () => {
    const onSetChatText = vi.fn();
    const { result } = renderHook(() =>
      useChatPanelComposerHelpers({ locale: "en", chatText: "", onSetChatText })
    );

    act(() => {
      result.current.insertQuoteToComposer("alice", "line1\nline2");
    });
    const arg = onSetChatText.mock.calls[0][0] as string;
    expect(arg).toContain("> line1");
    expect(arg).toContain("> line2");
  });
});
