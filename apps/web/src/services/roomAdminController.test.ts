import { describe, it, expect, vi, beforeEach } from "vitest";
import { RoomAdminController } from "./roomAdminController";

vi.mock("../api", () => ({
  api: {
    roomTree: vi.fn(),
    archivedRooms: vi.fn(),
    rooms: vi.fn(),
    createCategory: vi.fn(),
    updateCategory: vi.fn(),
    moveCategory: vi.fn(),
    deleteCategory: vi.fn(),
    createRoom: vi.fn(),
    updateRoom: vi.fn(),
    moveRoom: vi.fn(),
    deleteRoom: vi.fn(),
    restoreRoom: vi.fn(),
    deleteRoomPermanent: vi.fn(),
    clearRoomMessages: vi.fn(),
    promoteUser: vi.fn(),
    demoteUser: vi.fn(),
    banUser: vi.fn(),
    unbanUser: vi.fn(),
    setUserAccessState: vi.fn(),
    deleteUser: vi.fn(),
    forceDeleteUserNow: vi.fn(),
    adminUsers: vi.fn()
  }
}));

import { api } from "../api";

const apiMock = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

function makeOptions() {
  return {
    pushLog: vi.fn(),
    pushToast: vi.fn(),
    setRoomSlug: vi.fn(),
    setMessages: vi.fn(),
    setMessagesHasMore: vi.fn(),
    setMessagesNextCursor: vi.fn(),
    sendRoomJoinEvent: vi.fn().mockResolvedValue(undefined),
    setRooms: vi.fn(),
    setRoomsTree: vi.fn(),
    setRoomsTreeLoading: vi.fn(),
    setArchivedRooms: vi.fn(),
    setAdminUsers: vi.fn(),
    getCurrentServerId: vi.fn().mockReturnValue("srv-1")
  };
}

beforeEach(() => {
  Object.values(apiMock).forEach((m) => m.mockReset());
  apiMock.adminUsers.mockResolvedValue({ users: [{ id: "u" }] });
});

describe("RoomAdminController.loadRoomTree", () => {
  it("clears tree when getCurrentServerId is empty", async () => {
    const opts = makeOptions();
    opts.getCurrentServerId.mockReturnValue("");
    const ctrl = new RoomAdminController(opts);

    await ctrl.loadRoomTree("tok");
    expect(opts.setRoomsTree).toHaveBeenCalledWith(null);
    expect(opts.setArchivedRooms).toHaveBeenCalledWith([]);
    expect(opts.setRoomsTreeLoading).toHaveBeenNthCalledWith(1, true);
    expect(opts.setRoomsTreeLoading).toHaveBeenLastCalledWith(false);
    expect(apiMock.roomTree).not.toHaveBeenCalled();
  });

  it("loads tree + archived rooms", async () => {
    const opts = makeOptions();
    apiMock.roomTree.mockResolvedValueOnce({ tree: [], categories: [] });
    apiMock.archivedRooms.mockResolvedValueOnce({ rooms: [{ id: "r1" }] });

    const ctrl = new RoomAdminController(opts);
    await ctrl.loadRoomTree("tok");

    expect(apiMock.roomTree).toHaveBeenCalledWith("tok", "srv-1");
    expect(opts.setRoomsTree).toHaveBeenCalledWith({ tree: [], categories: [] });
    expect(opts.setArchivedRooms).toHaveBeenCalledWith([{ id: "r1" }]);
  });

  it("skips archived load when includeArchived=false", async () => {
    const opts = makeOptions();
    apiMock.roomTree.mockResolvedValueOnce({ tree: [] });

    const ctrl = new RoomAdminController(opts);
    await ctrl.loadRoomTree("tok", false);

    expect(apiMock.archivedRooms).not.toHaveBeenCalled();
    expect(opts.setArchivedRooms).toHaveBeenCalledWith([]);
  });

  it("logs and clears archived list when archivedRooms throws", async () => {
    const opts = makeOptions();
    apiMock.roomTree.mockResolvedValueOnce({ tree: [] });
    apiMock.archivedRooms.mockRejectedValueOnce(new Error("net"));

    const ctrl = new RoomAdminController(opts);
    await ctrl.loadRoomTree("tok");

    expect(opts.setArchivedRooms).toHaveBeenLastCalledWith([]);
    expect(opts.pushLog).toHaveBeenCalledWith(expect.stringContaining("archived rooms failed: net"));
  });

  it("logs and clears when roomTree throws", async () => {
    const opts = makeOptions();
    apiMock.roomTree.mockRejectedValueOnce(new Error("boom"));

    const ctrl = new RoomAdminController(opts);
    await ctrl.loadRoomTree("tok");

    expect(opts.pushLog).toHaveBeenCalledWith(expect.stringContaining("room tree failed: boom"));
    expect(opts.setArchivedRooms).toHaveBeenCalledWith([]);
    expect(opts.setRoomsTreeLoading).toHaveBeenLastCalledWith(false);
  });
});

describe("RoomAdminController category CRUD", () => {
  it("createCategory: trims title, calls api with serverId, reloads tree", async () => {
    const opts = makeOptions();
    apiMock.createCategory.mockResolvedValueOnce({ category: { slug: "general" } });
    apiMock.roomTree.mockResolvedValue({ tree: [] });
    apiMock.archivedRooms.mockResolvedValue({ rooms: [] });

    const ctrl = new RoomAdminController(opts);
    const ok = await ctrl.createCategory("tok", "  General  ");

    expect(ok).toBe(true);
    expect(apiMock.createCategory).toHaveBeenCalledWith("tok", { title: "General", server_id: "srv-1" });
    expect(opts.pushLog).toHaveBeenCalledWith("category created: general");
  });

  it("createCategory: returns false on failure", async () => {
    const opts = makeOptions();
    apiMock.createCategory.mockRejectedValueOnce(new Error("dup"));
    const ctrl = new RoomAdminController(opts);
    const ok = await ctrl.createCategory("tok", "X");
    expect(ok).toBe(false);
    expect(opts.pushLog).toHaveBeenCalledWith("create category failed: dup");
  });

  it("updateCategory: trims and reloads", async () => {
    const opts = makeOptions();
    apiMock.updateCategory.mockResolvedValue(undefined);
    apiMock.roomTree.mockResolvedValue({ tree: [] });
    apiMock.archivedRooms.mockResolvedValue({ rooms: [] });

    const ctrl = new RoomAdminController(opts);
    const ok = await ctrl.updateCategory("tok", "cat-1", "  New ");
    expect(ok).toBe(true);
    expect(apiMock.updateCategory).toHaveBeenCalledWith("tok", "cat-1", { title: "New" });
    expect(opts.pushLog).toHaveBeenCalledWith("category updated");
  });

  it("moveCategory up", async () => {
    const opts = makeOptions();
    apiMock.moveCategory.mockResolvedValue(undefined);
    apiMock.roomTree.mockResolvedValue({ tree: [] });
    apiMock.archivedRooms.mockResolvedValue({ rooms: [] });

    const ctrl = new RoomAdminController(opts);
    const ok = await ctrl.moveCategory("tok", "cat-1", "up");
    expect(ok).toBe(true);
    expect(apiMock.moveCategory).toHaveBeenCalledWith("tok", "cat-1", "up");
    expect(opts.pushLog).toHaveBeenCalledWith("category moved up");
  });

  it("deleteCategory reloads rooms list and tree", async () => {
    const opts = makeOptions();
    apiMock.deleteCategory.mockResolvedValue(undefined);
    apiMock.rooms.mockResolvedValue({ rooms: [{ id: "r1" }] });
    apiMock.roomTree.mockResolvedValue({ tree: [] });
    apiMock.archivedRooms.mockResolvedValue({ rooms: [] });

    const ctrl = new RoomAdminController(opts);
    const ok = await ctrl.deleteCategory("tok", "cat-1");
    expect(ok).toBe(true);
    expect(apiMock.rooms).toHaveBeenCalledWith("tok", "srv-1");
    expect(opts.setRooms).toHaveBeenCalledWith([{ id: "r1" }]);
  });
});

describe("RoomAdminController room CRUD", () => {
  it("createRoom: passes options and reloads", async () => {
    const opts = makeOptions();
    apiMock.createRoom.mockResolvedValueOnce({ room: { slug: "general" } });
    apiMock.rooms.mockResolvedValue({ rooms: [] });
    apiMock.roomTree.mockResolvedValue({ tree: [] });
    apiMock.archivedRooms.mockResolvedValue({ rooms: [] });

    const ctrl = new RoomAdminController(opts);
    const ok = await ctrl.createRoom("tok", "  General  ", {
      kind: "text",
      categoryId: "cat-1",
      nsfw: true,
      audioQualityOverride: null
    });
    expect(ok).toBe(true);
    expect(apiMock.createRoom).toHaveBeenCalledWith("tok", expect.objectContaining({
      title: "General",
      kind: "text",
      category_id: "cat-1",
      nsfw: true,
      server_id: "srv-1"
    }));
    expect(opts.pushLog).toHaveBeenCalledWith("room created: general");
  });

  it("createRoom: pushes toast on failure", async () => {
    const opts = makeOptions();
    apiMock.createRoom.mockRejectedValueOnce(new Error("limit"));
    const ctrl = new RoomAdminController(opts);
    const ok = await ctrl.createRoom("tok", "T", { kind: "text", categoryId: null });
    expect(ok).toBe(false);
    expect(opts.pushToast).toHaveBeenCalledWith("create room failed: limit");
  });

  it("updateRoom passes booleans normalized", async () => {
    const opts = makeOptions();
    apiMock.updateRoom.mockResolvedValue(undefined);
    apiMock.rooms.mockResolvedValue({ rooms: [] });
    apiMock.roomTree.mockResolvedValue({ tree: [] });
    apiMock.archivedRooms.mockResolvedValue({ rooms: [] });

    const ctrl = new RoomAdminController(opts);
    const ok = await ctrl.updateRoom("tok", "r-1", { title: "  T  ", kind: "voice", categoryId: null });
    expect(ok).toBe(true);
    expect(apiMock.updateRoom).toHaveBeenCalledWith("tok", "r-1", expect.objectContaining({
      title: "T",
      kind: "voice",
      is_hidden: false,
      nsfw: false
    }));
  });

  it("deleteRoom logs archived", async () => {
    const opts = makeOptions();
    apiMock.deleteRoom.mockResolvedValue(undefined);
    apiMock.rooms.mockResolvedValue({ rooms: [] });
    apiMock.roomTree.mockResolvedValue({ tree: [] });
    apiMock.archivedRooms.mockResolvedValue({ rooms: [] });

    const ctrl = new RoomAdminController(opts);
    expect(await ctrl.deleteRoom("tok", "r-1")).toBe(true);
    expect(opts.pushLog).toHaveBeenCalledWith("channel archived");
  });

  it("restoreRoom logs restored", async () => {
    const opts = makeOptions();
    apiMock.restoreRoom.mockResolvedValue(undefined);
    apiMock.rooms.mockResolvedValue({ rooms: [] });
    apiMock.roomTree.mockResolvedValue({ tree: [] });
    apiMock.archivedRooms.mockResolvedValue({ rooms: [] });

    const ctrl = new RoomAdminController(opts);
    expect(await ctrl.restoreRoom("tok", "r-1")).toBe(true);
    expect(opts.pushLog).toHaveBeenCalledWith("channel restored");
  });

  it("deleteRoomPermanent logs", async () => {
    const opts = makeOptions();
    apiMock.deleteRoomPermanent.mockResolvedValue(undefined);
    apiMock.roomTree.mockResolvedValue({ tree: [] });
    apiMock.archivedRooms.mockResolvedValue({ rooms: [] });

    const ctrl = new RoomAdminController(opts);
    expect(await ctrl.deleteRoomPermanent("tok", "r-1")).toBe(true);
    expect(opts.pushLog).toHaveBeenCalledWith("channel deleted permanently");
  });

  it("clearRoomMessages logs deleted count", async () => {
    const opts = makeOptions();
    apiMock.clearRoomMessages.mockResolvedValueOnce({ deletedCount: 17 });

    const ctrl = new RoomAdminController(opts);
    expect(await ctrl.clearRoomMessages("tok", "r-1")).toBe(true);
    expect(opts.pushLog).toHaveBeenCalledWith("channel chat cleared (17)");
  });

  it("clearRoomMessages returns false on error", async () => {
    const opts = makeOptions();
    apiMock.clearRoomMessages.mockRejectedValueOnce(new Error("denied"));
    const ctrl = new RoomAdminController(opts);
    expect(await ctrl.clearRoomMessages("tok", "r-1")).toBe(false);
  });

  it("joinRoom sends join event and updates slug", async () => {
    const opts = makeOptions();
    const ctrl = new RoomAdminController(opts);
    await ctrl.joinRoom("welcome");
    expect(opts.sendRoomJoinEvent).toHaveBeenCalledWith("welcome");
    expect(opts.setRoomSlug).toHaveBeenCalledWith("welcome");
  });
});

describe("RoomAdminController user actions", () => {
  it("promote: updates admin users on success", async () => {
    const opts = makeOptions();
    apiMock.promoteUser.mockResolvedValue(undefined);
    apiMock.adminUsers.mockResolvedValue({ users: [{ id: "u1" }] });

    const ctrl = new RoomAdminController(opts);
    await ctrl.promote("tok", "u1");
    expect(opts.setAdminUsers).toHaveBeenCalledWith([{ id: "u1" }]);
    expect(opts.pushLog).toHaveBeenCalledWith("user promoted to admin");
  });

  it("demote: handles error", async () => {
    const opts = makeOptions();
    apiMock.demoteUser.mockRejectedValueOnce(new Error("denied"));
    const ctrl = new RoomAdminController(opts);
    await ctrl.demote("tok", "u1");
    expect(opts.pushLog).toHaveBeenCalledWith("demote failed: denied");
    expect(opts.setAdminUsers).not.toHaveBeenCalled();
  });

  it("setBan: ban path", async () => {
    const opts = makeOptions();
    apiMock.banUser.mockResolvedValue(undefined);
    apiMock.adminUsers.mockResolvedValue({ users: [] });
    const ctrl = new RoomAdminController(opts);
    await ctrl.setBan("tok", "u1", true);
    expect(apiMock.banUser).toHaveBeenCalledWith("tok", "u1");
    expect(opts.pushLog).toHaveBeenCalledWith("user banned");
  });

  it("setBan: unban path", async () => {
    const opts = makeOptions();
    apiMock.unbanUser.mockResolvedValue(undefined);
    apiMock.adminUsers.mockResolvedValue({ users: [] });
    const ctrl = new RoomAdminController(opts);
    await ctrl.setBan("tok", "u1", false);
    expect(apiMock.unbanUser).toHaveBeenCalledWith("tok", "u1");
    expect(opts.pushLog).toHaveBeenCalledWith("user unbanned");
  });

  it("setBan: error log respects banned flag", async () => {
    const opts = makeOptions();
    apiMock.banUser.mockRejectedValueOnce(new Error("nope"));
    const ctrl = new RoomAdminController(opts);
    await ctrl.setBan("tok", "u1", true);
    expect(opts.pushLog).toHaveBeenCalledWith("ban failed: nope");
  });

  it("setAccessState: logs state value", async () => {
    const opts = makeOptions();
    apiMock.setUserAccessState.mockResolvedValue(undefined);
    apiMock.adminUsers.mockResolvedValue({ users: [] });
    const ctrl = new RoomAdminController(opts);
    await ctrl.setAccessState("tok", "u1", "blocked");
    expect(apiMock.setUserAccessState).toHaveBeenCalledWith("tok", "u1", "blocked");
    expect(opts.pushLog).toHaveBeenCalledWith("user access state updated: blocked");
  });

  it("deleteUser: returns true and reloads users", async () => {
    const opts = makeOptions();
    apiMock.deleteUser.mockResolvedValue(undefined);
    apiMock.adminUsers.mockResolvedValue({ users: [{ id: "u" }] });
    const ctrl = new RoomAdminController(opts);
    const ok = await ctrl.deleteUser("tok", "u1");
    expect(ok).toBe(true);
    expect(opts.setAdminUsers).toHaveBeenCalledWith([{ id: "u" }]);
  });

  it("deleteUser: returns false on failure", async () => {
    const opts = makeOptions();
    apiMock.deleteUser.mockRejectedValueOnce(new Error("x"));
    const ctrl = new RoomAdminController(opts);
    expect(await ctrl.deleteUser("tok", "u1")).toBe(false);
  });

  it("forceDeleteUserNow: success path", async () => {
    const opts = makeOptions();
    apiMock.forceDeleteUserNow.mockResolvedValue(undefined);
    apiMock.adminUsers.mockResolvedValue({ users: [] });
    const ctrl = new RoomAdminController(opts);
    expect(await ctrl.forceDeleteUserNow("tok", "u1")).toBe(true);
    expect(opts.pushLog).toHaveBeenCalledWith("user force deleted");
  });
});
