// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useRoomMutePresetState } from "./useRoomMutePresetState";

const t = ((key: string) => key) as unknown as Parameters<typeof useRoomMutePresetState>[0]["t"];

function setup(overrides: Partial<Parameters<typeof useRoomMutePresetState>[0]> = {}) {
  const onRoomMutePresetChange = vi.fn();
  const onSetRoomNotificationMutePreset = vi.fn().mockResolvedValue(undefined);
  const result = renderHook((props: Parameters<typeof useRoomMutePresetState>[0]) =>
    useRoomMutePresetState(props), {
    initialProps: {
      t,
      roomId: "r1",
      roomMutePresetValue: null,
      onRoomMutePresetChange,
      onSetRoomNotificationMutePreset,
      ...overrides
    }
  });
  return { ...result, onRoomMutePresetChange, onSetRoomNotificationMutePreset };
}

describe("useRoomMutePresetState", () => {
  it("syncs preset from incoming roomMutePresetValue", () => {
    const { result, rerender } = setup({ roomMutePresetValue: "1h" });
    expect(result.current.roomMutePreset).toBe("1h");
    rerender({
      t,
      roomId: "r1",
      roomMutePresetValue: "24h",
      onRoomMutePresetChange: vi.fn(),
      onSetRoomNotificationMutePreset: vi.fn().mockResolvedValue(undefined)
    });
    expect(result.current.roomMutePreset).toBe("24h");
  });

  it("applies preset and notifies callbacks on success", async () => {
    const { result, onRoomMutePresetChange, onSetRoomNotificationMutePreset } = setup({
      roomMutePresetValue: null
    });
    await act(async () => {
      await result.current.applyRoomMutePreset("1h");
    });
    expect(onSetRoomNotificationMutePreset).toHaveBeenCalledWith("r1", "1h");
    expect(onRoomMutePresetChange).toHaveBeenCalledWith("r1", "1h");
    expect(result.current.roomMutePreset).toBe("1h");
    expect(result.current.roomMuteStatusText).toBe("chat.notificationSaved");
    expect(result.current.roomMuteSaving).toBe(false);
  });

  it("toggles same preset to off", async () => {
    const { result, onSetRoomNotificationMutePreset } = setup({ roomMutePresetValue: "1h" });
    await act(async () => {
      await result.current.applyRoomMutePreset("1h");
    });
    expect(onSetRoomNotificationMutePreset).toHaveBeenCalledWith("r1", "off");
    expect(result.current.roomMutePreset).toBe("off");
  });

  it("sets error status when API rejects", async () => {
    const onSetRoomNotificationMutePreset = vi.fn().mockRejectedValue(new Error("boom"));
    const onRoomMutePresetChange = vi.fn();
    const { result } = renderHook(() =>
      useRoomMutePresetState({
        t,
        roomId: "r1",
        roomMutePresetValue: "off",
        onRoomMutePresetChange,
        onSetRoomNotificationMutePreset
      })
    );
    await act(async () => {
      await result.current.applyRoomMutePreset("1h");
    });
    expect(result.current.roomMuteStatusText).toBe("chat.notificationSaveError");
    expect(onRoomMutePresetChange).not.toHaveBeenCalled();
    expect(result.current.roomMuteSaving).toBe(false);
  });

  it("clearRoomMuteStatusText resets status text", async () => {
    const { result } = setup({ roomMutePresetValue: null });
    await act(async () => {
      await result.current.applyRoomMutePreset("1h");
    });
    expect(result.current.roomMuteStatusText).toBe("chat.notificationSaved");
    act(() => result.current.clearRoomMuteStatusText());
    expect(result.current.roomMuteStatusText).toBe("");
  });
});
