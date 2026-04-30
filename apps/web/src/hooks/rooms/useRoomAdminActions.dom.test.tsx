import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { FormEvent } from "react";
import { useRoomAdminActions } from "./useRoomAdminActions";

type Args = Parameters<typeof useRoomAdminActions>[0];

function makeController() {
  return {
    createRoom: vi.fn().mockResolvedValue(true),
    createCategory: vi.fn().mockResolvedValue(true),
    updateCategory: vi.fn().mockResolvedValue(true),
    moveCategory: vi.fn().mockResolvedValue(true),
    deleteCategory: vi.fn().mockResolvedValue(true),
    updateRoom: vi.fn().mockResolvedValue(true),
    moveRoom: vi.fn().mockResolvedValue(true),
    deleteRoom: vi.fn().mockResolvedValue(true),
    clearRoomMessages: vi.fn().mockResolvedValue(true),
    restoreRoom: vi.fn().mockResolvedValue(true),
    deleteRoomPermanent: vi.fn().mockResolvedValue(true)
  } as unknown as Args["roomAdminController"] & Record<string, ReturnType<typeof vi.fn>>;
}

function makeArgs(overrides: Partial<Args> = {}): Args {
  const ctrl = makeController();
  return {
    token: "tok",
    canCreateRooms: true,
    canManageAudioQuality: true,
    roomSlug: "current",
    allRooms: [],
    archivedRooms: [],
    roomAdminController: ctrl,
    newRoomTitle: "Title",
    newRoomKind: "text" as never,
    newRoomCategoryId: "none",
    newCategoryTitle: "Cat",
    editingCategoryTitle: "EditCat",
    categorySettingsPopupOpenId: null,
    editingRoomTitle: "EditRoom",
    editingRoomKind: "text" as never,
    editingRoomCategoryId: "none",
    editingRoomNsfw: false,
    editingRoomHidden: false,
    editingRoomAudioQualitySetting: "server_default" as never,
    channelSettingsPopupOpenId: null,
    setNewRoomTitle: vi.fn(),
    setChannelPopupOpen: vi.fn(),
    setNewCategoryTitle: vi.fn(),
    setCategoryPopupOpen: vi.fn(),
    setNewRoomCategoryId: vi.fn(),
    setEditingRoomTitle: vi.fn(),
    setEditingRoomKind: vi.fn(),
    setEditingRoomCategoryId: vi.fn(),
    setEditingRoomNsfw: vi.fn(),
    setEditingRoomHidden: vi.fn(),
    setEditingRoomAudioQualitySetting: vi.fn(),
    setChannelSettingsPopupOpenId: vi.fn(),
    setEditingCategoryTitle: vi.fn(),
    setCategorySettingsPopupOpenId: vi.fn(),
    setMessages: vi.fn(),
    setMessagesHasMore: vi.fn(),
    setMessagesNextCursor: vi.fn(),
    joinRoom: vi.fn(),
    ...overrides
  };
}

const fakeEvent = () =>
  ({ preventDefault: vi.fn() }) as unknown as FormEvent;

describe("useRoomAdminActions.createRoom", () => {
  it("noop without token", async () => {
    const args = makeArgs({ token: "" });
    const { result } = renderHook(() => useRoomAdminActions(args));
    const ev = fakeEvent();
    await act(async () => {
      await result.current.createRoom(ev);
    });
    expect((args.roomAdminController as never as { createRoom: ReturnType<typeof vi.fn> }).createRoom).not.toHaveBeenCalled();
    expect(ev.preventDefault).toHaveBeenCalled();
  });

  it("noop when canCreateRooms=false", async () => {
    const args = makeArgs({ canCreateRooms: false });
    const { result } = renderHook(() => useRoomAdminActions(args));
    await act(async () => {
      await result.current.createRoom(fakeEvent());
    });
    expect((args.roomAdminController as never as { createRoom: ReturnType<typeof vi.fn> }).createRoom).not.toHaveBeenCalled();
  });

  it("passes options + clears title and closes popup on success", async () => {
    const args = makeArgs({ newRoomCategoryId: "cat-1", newRoomTitle: "Hi" });
    const { result } = renderHook(() => useRoomAdminActions(args));
    await act(async () => {
      await result.current.createRoom(fakeEvent());
    });
    const ctrl = args.roomAdminController as never as { createRoom: ReturnType<typeof vi.fn> };
    expect(ctrl.createRoom).toHaveBeenCalledWith("tok", "Hi", expect.objectContaining({
      kind: "text",
      categoryId: "cat-1",
      nsfw: false,
      audioQualityOverride: null
    }));
    expect(args.setNewRoomTitle).toHaveBeenCalledWith("");
    expect(args.setChannelPopupOpen).toHaveBeenCalledWith(false);
  });

  it("'none' categoryId becomes null; canManageAudioQuality=false -> undefined override", async () => {
    const args = makeArgs({ canManageAudioQuality: false, newRoomCategoryId: "none" });
    const { result } = renderHook(() => useRoomAdminActions(args));
    await act(async () => {
      await result.current.createRoom(fakeEvent());
    });
    const ctrl = args.roomAdminController as never as { createRoom: ReturnType<typeof vi.fn> };
    expect(ctrl.createRoom).toHaveBeenCalledWith("tok", "Title", expect.objectContaining({
      categoryId: null,
      audioQualityOverride: undefined
    }));
  });

  it("does not clear title when controller returns false", async () => {
    const args = makeArgs();
    (args.roomAdminController as never as { createRoom: ReturnType<typeof vi.fn> }).createRoom.mockResolvedValueOnce(false);
    const { result } = renderHook(() => useRoomAdminActions(args));
    await act(async () => {
      await result.current.createRoom(fakeEvent());
    });
    expect(args.setNewRoomTitle).not.toHaveBeenCalled();
    expect(args.setChannelPopupOpen).not.toHaveBeenCalled();
  });
});

describe("useRoomAdminActions.createCategory", () => {
  it("clears title + closes popup on success", async () => {
    const args = makeArgs();
    const { result } = renderHook(() => useRoomAdminActions(args));
    await act(async () => {
      await result.current.createCategory(fakeEvent());
    });
    expect(args.setNewCategoryTitle).toHaveBeenCalledWith("");
    expect(args.setCategoryPopupOpen).toHaveBeenCalledWith(false);
  });

  it("noop when canCreateRooms=false", async () => {
    const args = makeArgs({ canCreateRooms: false });
    const { result } = renderHook(() => useRoomAdminActions(args));
    await act(async () => {
      await result.current.createCategory(fakeEvent());
    });
    expect((args.roomAdminController as never as { createCategory: ReturnType<typeof vi.fn> }).createCategory).not.toHaveBeenCalled();
  });
});

describe("useRoomAdminActions popup openers", () => {
  it("openCreateChannelPopup default 'none'", () => {
    const args = makeArgs();
    const { result } = renderHook(() => useRoomAdminActions(args));
    act(() => {
      result.current.openCreateChannelPopup();
    });
    expect(args.setNewRoomCategoryId).toHaveBeenCalledWith("none");
    expect(args.setChannelPopupOpen).toHaveBeenCalledWith(true);
  });

  it("openCreateChannelPopup with categoryId", () => {
    const args = makeArgs();
    const { result } = renderHook(() => useRoomAdminActions(args));
    act(() => {
      result.current.openCreateChannelPopup("cat-7");
    });
    expect(args.setNewRoomCategoryId).toHaveBeenCalledWith("cat-7");
  });

  it("openChannelSettingsPopup populates editing state", () => {
    const args = makeArgs();
    const { result } = renderHook(() => useRoomAdminActions(args));
    const room = {
      id: "r-1",
      slug: "general",
      title: "T",
      kind: "voice",
      category_id: "cat-1",
      nsfw: true,
      is_hidden: false,
      audio_quality_override: null
    } as never;
    act(() => {
      result.current.openChannelSettingsPopup(room);
    });
    expect(args.setEditingRoomTitle).toHaveBeenCalledWith("T");
    expect(args.setEditingRoomKind).toHaveBeenCalledWith("voice");
    expect(args.setEditingRoomCategoryId).toHaveBeenCalledWith("cat-1");
    expect(args.setEditingRoomNsfw).toHaveBeenCalledWith(true);
    expect(args.setEditingRoomHidden).toHaveBeenCalledWith(false);
    expect(args.setEditingRoomAudioQualitySetting).toHaveBeenCalledWith("server_default");
    expect(args.setChannelSettingsPopupOpenId).toHaveBeenCalledWith("r-1");
  });

  it("openChannelSettingsPopup falls back categoryId 'none'", () => {
    const args = makeArgs();
    const { result } = renderHook(() => useRoomAdminActions(args));
    act(() => {
      result.current.openChannelSettingsPopup({ id: "r1", title: "x", kind: "text" } as never);
    });
    expect(args.setEditingRoomCategoryId).toHaveBeenCalledWith("none");
  });

  it("openCategorySettingsPopup sets fields", () => {
    const args = makeArgs();
    const { result } = renderHook(() => useRoomAdminActions(args));
    act(() => {
      result.current.openCategorySettingsPopup("cat-1", "Title");
    });
    expect(args.setEditingCategoryTitle).toHaveBeenCalledWith("Title");
    expect(args.setCategorySettingsPopupOpenId).toHaveBeenCalledWith("cat-1");
  });
});

describe("useRoomAdminActions category mutators", () => {
  it("saveCategorySettings closes popup on success", async () => {
    const args = makeArgs({ categorySettingsPopupOpenId: "cat-1" });
    const { result } = renderHook(() => useRoomAdminActions(args));
    await act(async () => {
      await result.current.saveCategorySettings(fakeEvent());
    });
    const ctrl = args.roomAdminController as never as { updateCategory: ReturnType<typeof vi.fn> };
    expect(ctrl.updateCategory).toHaveBeenCalledWith("tok", "cat-1", "EditCat");
    expect(args.setCategorySettingsPopupOpenId).toHaveBeenCalledWith(null);
  });

  it("saveCategorySettings noop when no popup id", async () => {
    const args = makeArgs();
    const { result } = renderHook(() => useRoomAdminActions(args));
    await act(async () => {
      await result.current.saveCategorySettings(fakeEvent());
    });
    expect((args.roomAdminController as never as { updateCategory: ReturnType<typeof vi.fn> }).updateCategory).not.toHaveBeenCalled();
  });

  it("moveCategory invokes controller with direction", async () => {
    const args = makeArgs({ categorySettingsPopupOpenId: "cat-1" });
    const { result } = renderHook(() => useRoomAdminActions(args));
    await act(async () => {
      await result.current.moveCategory("up");
    });
    const ctrl = args.roomAdminController as never as { moveCategory: ReturnType<typeof vi.fn> };
    expect(ctrl.moveCategory).toHaveBeenCalledWith("tok", "cat-1", "up");
  });

  it("moveCategory noop without popup id", async () => {
    const args = makeArgs();
    const { result } = renderHook(() => useRoomAdminActions(args));
    await act(async () => {
      await result.current.moveCategory("down");
    });
    expect((args.roomAdminController as never as { moveCategory: ReturnType<typeof vi.fn> }).moveCategory).not.toHaveBeenCalled();
  });

  it("deleteCategory closes popup on success", async () => {
    const args = makeArgs({ categorySettingsPopupOpenId: "cat-1" });
    const { result } = renderHook(() => useRoomAdminActions(args));
    await act(async () => {
      await result.current.deleteCategory();
    });
    expect(args.setCategorySettingsPopupOpenId).toHaveBeenCalledWith(null);
  });

  it("deleteCategory keeps popup open when controller returns false", async () => {
    const args = makeArgs({ categorySettingsPopupOpenId: "cat-1" });
    (args.roomAdminController as never as { deleteCategory: ReturnType<typeof vi.fn> }).deleteCategory.mockResolvedValueOnce(false);
    const { result } = renderHook(() => useRoomAdminActions(args));
    await act(async () => {
      await result.current.deleteCategory();
    });
    expect(args.setCategorySettingsPopupOpenId).not.toHaveBeenCalled();
  });
});

describe("useRoomAdminActions channel mutators", () => {
  it("saveChannelSettings: maps editing fields, audio override resolution", async () => {
    const args = makeArgs({
      channelSettingsPopupOpenId: "r-1",
      editingRoomTitle: "T2",
      editingRoomKind: "voice" as never,
      editingRoomCategoryId: "cat-2",
      editingRoomNsfw: true,
      editingRoomHidden: true,
      editingRoomAudioQualitySetting: "high" as never,
      canManageAudioQuality: true
    });
    const { result } = renderHook(() => useRoomAdminActions(args));
    await act(async () => {
      await result.current.saveChannelSettings(fakeEvent());
    });
    const ctrl = args.roomAdminController as never as { updateRoom: ReturnType<typeof vi.fn> };
    expect(ctrl.updateRoom).toHaveBeenCalledWith("tok", "r-1", expect.objectContaining({
      title: "T2",
      kind: "voice",
      categoryId: "cat-2",
      isHidden: true,
      nsfw: true,
      audioQualityOverride: "high"
    }));
    expect(args.setChannelSettingsPopupOpenId).toHaveBeenCalledWith(null);
  });

  it("saveChannelSettings: 'server_default' becomes null when canManageAudioQuality", async () => {
    const args = makeArgs({
      channelSettingsPopupOpenId: "r-1",
      editingRoomAudioQualitySetting: "server_default" as never
    });
    const { result } = renderHook(() => useRoomAdminActions(args));
    await act(async () => {
      await result.current.saveChannelSettings(fakeEvent());
    });
    const ctrl = args.roomAdminController as never as { updateRoom: ReturnType<typeof vi.fn> };
    expect(ctrl.updateRoom).toHaveBeenCalledWith("tok", "r-1", expect.objectContaining({
      audioQualityOverride: null
    }));
  });

  it("saveChannelSettings: undefined override when canManageAudioQuality=false", async () => {
    const args = makeArgs({
      channelSettingsPopupOpenId: "r-1",
      canManageAudioQuality: false,
      editingRoomAudioQualitySetting: "high" as never
    });
    const { result } = renderHook(() => useRoomAdminActions(args));
    await act(async () => {
      await result.current.saveChannelSettings(fakeEvent());
    });
    const ctrl = args.roomAdminController as never as { updateRoom: ReturnType<typeof vi.fn> };
    expect(ctrl.updateRoom).toHaveBeenCalledWith("tok", "r-1", expect.objectContaining({
      audioQualityOverride: undefined
    }));
  });

  it("moveChannel invokes controller with direction", async () => {
    const args = makeArgs({ channelSettingsPopupOpenId: "r-1" });
    const { result } = renderHook(() => useRoomAdminActions(args));
    await act(async () => {
      await result.current.moveChannel("down");
    });
    const ctrl = args.roomAdminController as never as { moveRoom: ReturnType<typeof vi.fn> };
    expect(ctrl.moveRoom).toHaveBeenCalledWith("tok", "r-1", "down");
  });

  it("deleteChannel: navigates to 'general' fallback when current room deleted", async () => {
    const args = makeArgs({
      channelSettingsPopupOpenId: "r-1",
      roomSlug: "current",
      allRooms: [
        { id: "r-2", slug: "general" } as never,
        { id: "r-3", slug: "other" } as never
      ]
    });
    const { result } = renderHook(() => useRoomAdminActions(args));
    await act(async () => {
      await result.current.deleteChannel({ id: "r-1", slug: "current" } as never);
    });
    expect(args.joinRoom).toHaveBeenCalledWith("general");
    expect(args.setChannelSettingsPopupOpenId).toHaveBeenCalledWith(null);
  });

  it("deleteChannel: falls back to first non-deleted room when no 'general'", async () => {
    const args = makeArgs({
      roomSlug: "current",
      allRooms: [
        { id: "r-1", slug: "current" } as never,
        { id: "r-9", slug: "alpha" } as never
      ]
    });
    const { result } = renderHook(() => useRoomAdminActions(args));
    await act(async () => {
      await result.current.deleteChannel({ id: "r-1", slug: "current" } as never);
    });
    expect(args.joinRoom).toHaveBeenCalledWith("alpha");
  });

  it("deleteChannel: no joinRoom when deleting non-current channel", async () => {
    const args = makeArgs({
      channelSettingsPopupOpenId: "r-9",
      roomSlug: "current",
      allRooms: [{ id: "r-9", slug: "other" } as never]
    });
    const { result } = renderHook(() => useRoomAdminActions(args));
    await act(async () => {
      await result.current.deleteChannel({ id: "r-9", slug: "other" } as never);
    });
    expect(args.joinRoom).not.toHaveBeenCalled();
    expect(args.setChannelSettingsPopupOpenId).toHaveBeenCalledWith(null);
  });

  it("deleteChannel: noop when controller fails", async () => {
    const args = makeArgs({ channelSettingsPopupOpenId: "r-1" });
    (args.roomAdminController as never as { deleteRoom: ReturnType<typeof vi.fn> }).deleteRoom.mockResolvedValueOnce(false);
    const { result } = renderHook(() => useRoomAdminActions(args));
    await act(async () => {
      await result.current.deleteChannel({ id: "r-1", slug: "current" } as never);
    });
    expect(args.setChannelSettingsPopupOpenId).not.toHaveBeenCalled();
  });

  it("clearChannelMessages: resets timeline only when current room", async () => {
    const args = makeArgs({ channelSettingsPopupOpenId: "r-1", roomSlug: "current" });
    const { result } = renderHook(() => useRoomAdminActions(args));

    await act(async () => {
      await result.current.clearChannelMessages({ slug: "current" } as never);
    });
    expect(args.setMessages).toHaveBeenCalledWith([]);
    expect(args.setMessagesHasMore).toHaveBeenCalledWith(false);
    expect(args.setMessagesNextCursor).toHaveBeenCalledWith(null);

    (args.setMessages as ReturnType<typeof vi.fn>).mockClear();
    await act(async () => {
      await result.current.clearChannelMessages({ slug: "other" } as never);
    });
    expect(args.setMessages).not.toHaveBeenCalled();
  });

  it("clearChannelMessages: noop without popup id", async () => {
    const args = makeArgs({ roomSlug: "current" });
    const { result } = renderHook(() => useRoomAdminActions(args));
    await act(async () => {
      await result.current.clearChannelMessages({ slug: "current" } as never);
    });
    expect((args.roomAdminController as never as { clearRoomMessages: ReturnType<typeof vi.fn> }).clearRoomMessages).not.toHaveBeenCalled();
  });

  it("restoreChannel: joins room when no current slug", async () => {
    const args = makeArgs({ roomSlug: "" });
    const { result } = renderHook(() => useRoomAdminActions(args));
    await act(async () => {
      await result.current.restoreChannel({ id: "r-1", slug: "alpha" } as never);
    });
    expect(args.joinRoom).toHaveBeenCalledWith("alpha");
  });

  it("restoreChannel: skips joinRoom when already in a room", async () => {
    const args = makeArgs({ roomSlug: "current" });
    const { result } = renderHook(() => useRoomAdminActions(args));
    await act(async () => {
      await result.current.restoreChannel({ id: "r-1", slug: "alpha" } as never);
    });
    expect(args.joinRoom).not.toHaveBeenCalled();
  });

  it("deleteChannelPermanent: navigates to 'general' fallback", async () => {
    const args = makeArgs({
      roomSlug: "alpha",
      allRooms: [{ slug: "general" } as never, { slug: "beta" } as never]
    });
    const { result } = renderHook(() => useRoomAdminActions(args));
    await act(async () => {
      await result.current.deleteChannelPermanent({ id: "r-1", slug: "alpha" } as never);
    });
    expect(args.joinRoom).toHaveBeenCalledWith("general");
  });

  it("deleteChannelPermanent: first room fallback", async () => {
    const args = makeArgs({
      roomSlug: "alpha",
      allRooms: [{ slug: "beta" } as never]
    });
    const { result } = renderHook(() => useRoomAdminActions(args));
    await act(async () => {
      await result.current.deleteChannelPermanent({ id: "r-1", slug: "alpha" } as never);
    });
    expect(args.joinRoom).toHaveBeenCalledWith("beta");
  });

  it("deleteChannelPermanent: noop when controller fails", async () => {
    const args = makeArgs();
    (args.roomAdminController as never as { deleteRoomPermanent: ReturnType<typeof vi.fn> }).deleteRoomPermanent.mockResolvedValueOnce(false);
    const { result } = renderHook(() => useRoomAdminActions(args));
    await act(async () => {
      await result.current.deleteChannelPermanent({ id: "r-1", slug: "alpha" } as never);
    });
    expect(args.joinRoom).not.toHaveBeenCalled();
  });
});
