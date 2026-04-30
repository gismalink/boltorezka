import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useChatPanelTopicCreate } from "./useChatPanelTopicCreate";

describe("useChatPanelTopicCreate", () => {
  it("does not submit empty/whitespace title", async () => {
    const onCreateTopic = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useChatPanelTopicCreate({ onCreateTopic }));

    await act(async () => {
      await result.current.handleCreateTopicSubmit({
        preventDefault: () => {}
      } as unknown as React.FormEvent);
    });
    expect(onCreateTopic).not.toHaveBeenCalled();

    act(() => {
      result.current.setNewTopicTitle("   ");
    });
    await act(async () => {
      await result.current.handleCreateTopicSubmit({ preventDefault: () => {} } as unknown as React.FormEvent);
    });
    expect(onCreateTopic).not.toHaveBeenCalled();
  });

  it("submits trimmed title, resets state and closes popup on success", async () => {
    let resolveCreate: () => void = () => {};
    const onCreateTopic = vi.fn().mockImplementation(
      () => new Promise<void>((resolve) => {
        resolveCreate = resolve;
      })
    );

    const { result } = renderHook(() => useChatPanelTopicCreate({ onCreateTopic }));

    act(() => {
      result.current.setTopicCreateOpen(true);
      result.current.setNewTopicTitle("  General  ");
    });

    let submitPromise: Promise<void> | undefined;
    act(() => {
      submitPromise = Promise.resolve(
        result.current.handleCreateTopicSubmit({ preventDefault: () => {} } as unknown as React.FormEvent)
      ) as unknown as Promise<void>;
    });

    expect(onCreateTopic).toHaveBeenCalledWith("General");

    await act(async () => {
      resolveCreate();
      await submitPromise;
    });

    expect(result.current.newTopicTitle).toBe("");
    expect(result.current.topicCreateOpen).toBe(false);
    expect(result.current.creatingTopic).toBe(false);
  });

  it("ignores second submit while creating", async () => {
    let resolveCreate: () => void = () => {};
    const onCreateTopic = vi.fn().mockImplementation(
      () => new Promise<void>((resolve) => {
        resolveCreate = resolve;
      })
    );

    const { result } = renderHook(() => useChatPanelTopicCreate({ onCreateTopic }));

    act(() => {
      result.current.setNewTopicTitle("Topic");
    });

    act(() => {
      result.current.handleCreateTopicSubmit({ preventDefault: () => {} } as unknown as React.FormEvent);
    });
    act(() => {
      result.current.handleCreateTopicSubmit({ preventDefault: () => {} } as unknown as React.FormEvent);
    });

    expect(onCreateTopic).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveCreate();
      await Promise.resolve();
    });
  });

  it("Escape key closes popup when open", () => {
    const { result } = renderHook(() => useChatPanelTopicCreate({ onCreateTopic: vi.fn() }));

    act(() => {
      result.current.setTopicCreateOpen(true);
    });
    expect(result.current.topicCreateOpen).toBe(true);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(result.current.topicCreateOpen).toBe(false);
  });

  it("pointerdown outside anchor/popup closes popup, inside keeps it", () => {
    const { result } = renderHook(() => useChatPanelTopicCreate({ onCreateTopic: vi.fn() }));

    act(() => {
      result.current.setTopicCreateOpen(true);
    });

    // Inside popup → stays open
    const inside = document.createElement("div");
    inside.className = "chat-topic-create-popup";
    document.body.appendChild(inside);
    act(() => {
      const ev = new Event("pointerdown", { bubbles: true });
      Object.defineProperty(ev, "target", { value: inside });
      window.dispatchEvent(ev);
    });
    expect(result.current.topicCreateOpen).toBe(true);

    // Outside → closes
    const outside = document.createElement("div");
    document.body.appendChild(outside);
    act(() => {
      const ev = new Event("pointerdown", { bubbles: true });
      Object.defineProperty(ev, "target", { value: outside });
      window.dispatchEvent(ev);
    });
    expect(result.current.topicCreateOpen).toBe(false);
  });
});
