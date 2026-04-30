import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { selectExistingServerId, useServerProfileActions } from "./useServerProfileActions";

vi.mock("../../api", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../api")>();
  return {
    ...orig,
    api: {
      createServer: vi.fn(),
      servers: vi.fn(),
      createServerInvite: vi.fn(),
      renameServer: vi.fn(),
      revokeServerAge: vi.fn(),
      confirmServerAge: vi.fn(),
      leaveServer: vi.fn(),
      deleteServer: vi.fn(),
      removeServerMember: vi.fn(),
      applyServerBan: vi.fn(),
      revokeServerBan: vi.fn(),
      transferServerOwnership: vi.fn(),
      serverMemberProfile: vi.fn(),
      serverMembers: vi.fn(),
      serverRoles: vi.fn(),
      createServerRole: vi.fn(),
      renameServerRole: vi.fn(),
      deleteServerRole: vi.fn(),
      setServerMemberCustomRoles: vi.fn(),
      setServerMemberHiddenRoomAccess: vi.fn()
    }
  };
});

import { ApiError, api } from "../../api";

const apiMock = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

function makeArgs(overrides: Partial<Parameters<typeof useServerProfileActions>[0]> = {}) {
  return {
    token: "tok",
    currentServerId: "srv-1",
    creatingInvite: false,
    serverAgeConfirming: false,
    serverAgeConfirmedAt: null as string | null,
    lastInviteUrl: "",
    setCreatingServer: vi.fn(),
    setServers: vi.fn(),
    setCurrentServerId: vi.fn(),
    setCreatingInvite: vi.fn(),
    setLastInviteUrl: vi.fn(),
    setServerAgeConfirming: vi.fn(),
    setServerAgeConfirmedAt: vi.fn(),
    setServerMembers: vi.fn(),
    pushToast: vi.fn(),
    t: (k: string) => k,
    ...overrides
  };
}

beforeEach(() => {
  Object.values(apiMock).forEach((m) => m.mockReset());
});

describe("selectExistingServerId", () => {
  it("returns preferred when present", () => {
    expect(selectExistingServerId([{ id: "a" }, { id: "b" }] as never, "b")).toBe("b");
  });
  it("returns first when preferred missing", () => {
    expect(selectExistingServerId([{ id: "a" }, { id: "b" }] as never, "z")).toBe("a");
  });
  it("returns empty when list empty", () => {
    expect(selectExistingServerId([], "x")).toBe("");
  });
  it("trims preferred", () => {
    expect(selectExistingServerId([{ id: "a" }] as never, "  a  ")).toBe("a");
  });
});

describe("useServerProfileActions.handleCreateServer", () => {
  it("noop when token or name empty", async () => {
    const args = makeArgs({ token: "" });
    const { result } = renderHook(() => useServerProfileActions(args));
    await act(async () => {
      await result.current.handleCreateServer("Name");
    });
    expect(apiMock.createServer).not.toHaveBeenCalled();
  });

  it("creates server and pushes success toast", async () => {
    apiMock.createServer.mockResolvedValueOnce({ server: { id: "s-2" } });
    apiMock.servers.mockResolvedValueOnce({ servers: [{ id: "s-1" }, { id: "s-2" }] });

    const args = makeArgs();
    const { result } = renderHook(() => useServerProfileActions(args));
    await act(async () => {
      await result.current.handleCreateServer("  My Server  ");
    });

    expect(apiMock.createServer).toHaveBeenCalledWith("tok", { name: "My Server" });
    expect(args.setServers).toHaveBeenCalledWith([{ id: "s-1" }, { id: "s-2" }]);
    expect(args.setCurrentServerId).toHaveBeenCalledWith("s-2");
    expect(args.pushToast).toHaveBeenCalledWith("server.createSuccess");
    expect(args.setCreatingServer).toHaveBeenNthCalledWith(1, true);
    expect(args.setCreatingServer).toHaveBeenLastCalledWith(false);
  });

  it("uses limit-reached translation when ApiError ServerLimitReached", async () => {
    apiMock.createServer.mockRejectedValueOnce(new ApiError(403, { error: "ServerLimitReached" }));

    const args = makeArgs();
    const { result } = renderHook(() => useServerProfileActions(args));
    await act(async () => {
      await result.current.handleCreateServer("X");
    });
    expect(args.pushToast).toHaveBeenCalledWith("server.createLimitReached");
  });

  it("falls back to error message on generic failure", async () => {
    apiMock.createServer.mockRejectedValueOnce(new Error("boom"));
    const args = makeArgs();
    const { result } = renderHook(() => useServerProfileActions(args));
    await act(async () => {
      await result.current.handleCreateServer("X");
    });
    expect(args.pushToast).toHaveBeenCalledWith("boom");
  });
});

describe("useServerProfileActions.handleCreateServerInvite", () => {
  it("noop when creatingInvite already true", async () => {
    const args = makeArgs({ creatingInvite: true });
    const { result } = renderHook(() => useServerProfileActions(args));
    await act(async () => {
      await result.current.handleCreateServerInvite();
    });
    expect(apiMock.createServerInvite).not.toHaveBeenCalled();
  });

  it("absolutizes relative invite path", async () => {
    apiMock.createServerInvite.mockResolvedValueOnce({ inviteUrl: "/i/abc" });
    const args = makeArgs();
    const { result } = renderHook(() => useServerProfileActions(args));
    await act(async () => {
      await result.current.handleCreateServerInvite();
    });
    expect(args.setLastInviteUrl).toHaveBeenCalledWith(`${window.location.origin}/i/abc`);
    expect(args.pushToast).toHaveBeenCalledWith("server.inviteCreated");
  });

  it("keeps absolute invite url as-is", async () => {
    apiMock.createServerInvite.mockResolvedValueOnce({ inviteUrl: "https://example.com/i/abc" });
    const args = makeArgs();
    const { result } = renderHook(() => useServerProfileActions(args));
    await act(async () => {
      await result.current.handleCreateServerInvite();
    });
    expect(args.setLastInviteUrl).toHaveBeenCalledWith("https://example.com/i/abc");
  });

  it("pushes toast on failure", async () => {
    apiMock.createServerInvite.mockRejectedValueOnce(new Error("net"));
    const args = makeArgs();
    const { result } = renderHook(() => useServerProfileActions(args));
    await act(async () => {
      await result.current.handleCreateServerInvite();
    });
    expect(args.pushToast).toHaveBeenCalledWith("net");
  });
});

describe("useServerProfileActions.handleRenameCurrentServer", () => {
  it("updates server item by id and pushes success", async () => {
    apiMock.renameServer.mockResolvedValueOnce({ server: { id: "srv-1", name: "New" } });
    const args = makeArgs();
    args.setServers.mockImplementation((updater: any) => {
      const next = typeof updater === "function" ? updater([{ id: "srv-1", name: "Old" }, { id: "srv-2" }]) : updater;
      expect(next).toEqual([{ id: "srv-1", name: "New" }, { id: "srv-2" }]);
    });
    const { result } = renderHook(() => useServerProfileActions(args));
    await act(async () => {
      await result.current.handleRenameCurrentServer("  New  ");
    });
    expect(apiMock.renameServer).toHaveBeenCalledWith("tok", "srv-1", { name: "New" });
    expect(args.pushToast).toHaveBeenCalledWith("server.renameSuccess");
  });

  it("noop when name blank", async () => {
    const args = makeArgs();
    const { result } = renderHook(() => useServerProfileActions(args));
    await act(async () => {
      await result.current.handleRenameCurrentServer("   ");
    });
    expect(apiMock.renameServer).not.toHaveBeenCalled();
  });
});

describe("useServerProfileActions.handleConfirmServerAge", () => {
  it("calls confirm when not yet confirmed", async () => {
    apiMock.confirmServerAge.mockResolvedValueOnce({ confirmedAt: "2026-01-01T00:00:00Z" });
    const args = makeArgs();
    const { result } = renderHook(() => useServerProfileActions(args));
    await act(async () => {
      await result.current.handleConfirmServerAge();
    });
    expect(apiMock.confirmServerAge).toHaveBeenCalled();
    expect(args.setServerAgeConfirmedAt).toHaveBeenCalledWith("2026-01-01T00:00:00Z");
    expect(args.pushToast).toHaveBeenCalledWith("server.ageConfirmSuccess");
  });

  it("calls revoke when already confirmed", async () => {
    apiMock.revokeServerAge.mockResolvedValueOnce({ confirmedAt: null });
    const args = makeArgs({ serverAgeConfirmedAt: "2025-01-01T00:00:00Z" });
    const { result } = renderHook(() => useServerProfileActions(args));
    await act(async () => {
      await result.current.handleConfirmServerAge();
    });
    expect(apiMock.revokeServerAge).toHaveBeenCalled();
    expect(args.setServerAgeConfirmedAt).toHaveBeenCalledWith(null);
    expect(args.pushToast).toHaveBeenCalledWith("server.ageConfirmRevoked");
  });

  it("noop when serverAgeConfirming true", async () => {
    const args = makeArgs({ serverAgeConfirming: true });
    const { result } = renderHook(() => useServerProfileActions(args));
    await act(async () => {
      await result.current.handleConfirmServerAge();
    });
    expect(apiMock.confirmServerAge).not.toHaveBeenCalled();
  });
});

describe("useServerProfileActions clipboard actions", () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) }
    });
  });

  it("handleCopyInviteUrl: copies and pushes inviteCopied", async () => {
    const args = makeArgs({ lastInviteUrl: "https://x" });
    const { result } = renderHook(() => useServerProfileActions(args));
    await act(async () => {
      await result.current.handleCopyInviteUrl();
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("https://x");
    expect(args.pushToast).toHaveBeenCalledWith("server.inviteCopied");
  });

  it("handleCopyInviteUrl: noop on empty", async () => {
    const args = makeArgs();
    const { result } = renderHook(() => useServerProfileActions(args));
    await act(async () => {
      await result.current.handleCopyInviteUrl();
    });
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });

  it("handleCopyInviteUrl: pushes copyFailed when clipboard rejects", async () => {
    (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("denied"));
    const args = makeArgs({ lastInviteUrl: "u" });
    const { result } = renderHook(() => useServerProfileActions(args));
    await act(async () => {
      await result.current.handleCopyInviteUrl();
    });
    expect(args.pushToast).toHaveBeenCalledWith("server.inviteCopyFailed");
  });

  it("handleCreateServerInviteAndCopy: uses cached invite when available", async () => {
    const args = makeArgs({ lastInviteUrl: "https://cached" });
    const { result } = renderHook(() => useServerProfileActions(args));
    await act(async () => {
      await result.current.handleCreateServerInviteAndCopy();
    });
    expect(apiMock.createServerInvite).not.toHaveBeenCalled();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("https://cached");
  });

  it("handleCreateServerInviteAndCopy: creates new and copies absolutized", async () => {
    apiMock.createServerInvite.mockResolvedValueOnce({ inviteUrl: "/i/zz" });
    const args = makeArgs();
    const { result } = renderHook(() => useServerProfileActions(args));
    await act(async () => {
      await result.current.handleCreateServerInviteAndCopy();
    });
    expect(args.setLastInviteUrl).toHaveBeenCalledWith(`${window.location.origin}/i/zz`);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(`${window.location.origin}/i/zz`);
    expect(args.pushToast).toHaveBeenCalledWith("server.inviteCopied");
  });
});

describe("useServerProfileActions.handleServerChange", () => {
  it("trims and clears invite url", () => {
    const args = makeArgs();
    const { result } = renderHook(() => useServerProfileActions(args));
    act(() => {
      result.current.handleServerChange("  s-9  ");
    });
    expect(args.setCurrentServerId).toHaveBeenCalledWith("s-9");
    expect(args.setLastInviteUrl).toHaveBeenCalledWith("");
  });
});

describe("useServerProfileActions.handleLeaveCurrentServer / handleDeleteCurrentServer", () => {
  it("leave: refreshes list and selects existing", async () => {
    apiMock.leaveServer.mockResolvedValue(undefined);
    apiMock.servers.mockResolvedValue({ servers: [{ id: "s-9" }] });

    const args = makeArgs();
    args.setCurrentServerId.mockImplementation((updater: any) => {
      const next = typeof updater === "function" ? updater("srv-1") : updater;
      expect(next).toBe("s-9");
    });
    const { result } = renderHook(() => useServerProfileActions(args));
    await act(async () => {
      await result.current.handleLeaveCurrentServer();
    });
    expect(args.pushToast).toHaveBeenCalledWith("server.leaveSuccess");
    expect(args.setLastInviteUrl).toHaveBeenCalledWith("");
  });

  it("delete: ForbiddenRole shows specific toast, no list refresh", async () => {
    apiMock.deleteServer.mockRejectedValueOnce(new ApiError(403, { error: "ForbiddenRole" }));
    const args = makeArgs();
    const { result } = renderHook(() => useServerProfileActions(args));
    await act(async () => {
      await result.current.handleDeleteCurrentServer();
    });
    expect(args.pushToast).toHaveBeenCalledWith("server.deleteForbidden");
    expect(apiMock.servers).not.toHaveBeenCalled();
  });

  it("delete: DefaultServerCannotBeDeleted specific toast", async () => {
    apiMock.deleteServer.mockRejectedValueOnce(new ApiError(403, { error: "DefaultServerCannotBeDeleted" }));
    const args = makeArgs();
    const { result } = renderHook(() => useServerProfileActions(args));
    await act(async () => {
      await result.current.handleDeleteCurrentServer();
    });
    expect(args.pushToast).toHaveBeenCalledWith("server.deleteDefaultForbidden");
  });

  it("delete: success path refreshes list", async () => {
    apiMock.deleteServer.mockResolvedValue(undefined);
    apiMock.servers.mockResolvedValue({ servers: [] });
    const args = makeArgs();
    const { result } = renderHook(() => useServerProfileActions(args));
    await act(async () => {
      await result.current.handleDeleteCurrentServer();
    });
    expect(args.pushToast).toHaveBeenCalledWith("server.deleteSuccess");
  });
});

describe("useServerProfileActions member moderation", () => {
  it("removeServerMember: refreshes members on success", async () => {
    apiMock.removeServerMember.mockResolvedValue(undefined);
    apiMock.serverMembers.mockResolvedValue({ members: [{ id: "m1" }] });
    const args = makeArgs();
    const { result } = renderHook(() => useServerProfileActions(args));
    await act(async () => {
      await result.current.handleRemoveServerMember("u-1");
    });
    expect(apiMock.removeServerMember).toHaveBeenCalledWith("tok", "srv-1", "u-1");
    expect(args.setServerMembers).toHaveBeenCalledWith([{ id: "m1" }]);
    expect(args.pushToast).toHaveBeenCalledWith("server.memberRemoved");
  });

  it("removeServerMember: noop on blank user", async () => {
    const args = makeArgs();
    const { result } = renderHook(() => useServerProfileActions(args));
    await act(async () => {
      await result.current.handleRemoveServerMember("  ");
    });
    expect(apiMock.removeServerMember).not.toHaveBeenCalled();
  });

  it("banServerMember passes manual reason", async () => {
    apiMock.applyServerBan.mockResolvedValue(undefined);
    apiMock.serverMembers.mockResolvedValue({ members: [] });
    const args = makeArgs();
    const { result } = renderHook(() => useServerProfileActions(args));
    await act(async () => {
      await result.current.handleBanServerMember("u-1");
    });
    expect(apiMock.applyServerBan).toHaveBeenCalledWith("tok", "srv-1", "u-1", "manual server moderation");
    expect(args.pushToast).toHaveBeenCalledWith("server.memberBanned");
  });

  it("unbanServerMember success", async () => {
    apiMock.revokeServerBan.mockResolvedValue(undefined);
    apiMock.serverMembers.mockResolvedValue({ members: [] });
    const args = makeArgs();
    const { result } = renderHook(() => useServerProfileActions(args));
    await act(async () => {
      await result.current.handleUnbanServerMember("u-1");
    });
    expect(args.pushToast).toHaveBeenCalledWith("server.memberUnbanned");
  });

  it("transferServerOwnership refreshes servers and members", async () => {
    apiMock.transferServerOwnership.mockResolvedValue(undefined);
    apiMock.servers.mockResolvedValue({ servers: [{ id: "srv-1" }] });
    apiMock.serverMembers.mockResolvedValue({ members: [] });
    const args = makeArgs();
    const { result } = renderHook(() => useServerProfileActions(args));
    await act(async () => {
      await result.current.handleTransferServerOwnership("u-1");
    });
    expect(args.setServers).toHaveBeenCalledWith([{ id: "srv-1" }]);
    expect(args.pushToast).toHaveBeenCalledWith("server.ownerTransferred");
  });
});

describe("useServerProfileActions loaders", () => {
  it("loadServerMemberProfile returns member or null", async () => {
    apiMock.serverMemberProfile.mockResolvedValueOnce({ member: { id: "m1" } });
    const args = makeArgs();
    const { result } = renderHook(() => useServerProfileActions(args));
    let value: unknown = "untouched";
    await act(async () => {
      value = await result.current.loadServerMemberProfile("u-1");
    });
    expect(value).toEqual({ id: "m1" });
  });

  it("loadServerMemberProfile returns null on missing inputs", async () => {
    const args = makeArgs({ token: "" });
    const { result } = renderHook(() => useServerProfileActions(args));
    let value: unknown = "x";
    await act(async () => {
      value = await result.current.loadServerMemberProfile("u-1");
    });
    expect(value).toBeNull();
  });

  it("loadServerMemberProfile pushes toast and returns null on error", async () => {
    apiMock.serverMemberProfile.mockRejectedValueOnce(new Error("boom"));
    const args = makeArgs();
    const { result } = renderHook(() => useServerProfileActions(args));
    let value: unknown = "x";
    await act(async () => {
      value = await result.current.loadServerMemberProfile("u-1");
    });
    expect(value).toBeNull();
    expect(args.pushToast).toHaveBeenCalledWith("boom");
  });

  it("loadServerRoles returns array or empty fallback", async () => {
    apiMock.serverRoles.mockResolvedValueOnce({ roles: [{ id: "r1", name: "n", isBase: true }] });
    const args = makeArgs();
    const { result } = renderHook(() => useServerProfileActions(args));
    let value: unknown = null;
    await act(async () => {
      value = await result.current.loadServerRoles();
    });
    expect(value).toEqual([{ id: "r1", name: "n", isBase: true }]);
  });

  it("loadServerRoles returns [] on missing token", async () => {
    const args = makeArgs({ token: "" });
    const { result } = renderHook(() => useServerProfileActions(args));
    let value: unknown = null;
    await act(async () => {
      value = await result.current.loadServerRoles();
    });
    expect(value).toEqual([]);
    expect(apiMock.serverRoles).not.toHaveBeenCalled();
  });

  it("loadServerRoles returns [] on error", async () => {
    apiMock.serverRoles.mockRejectedValueOnce(new Error("x"));
    const args = makeArgs();
    const { result } = renderHook(() => useServerProfileActions(args));
    let value: unknown = null;
    await act(async () => {
      value = await result.current.loadServerRoles();
    });
    expect(value).toEqual([]);
  });
});

describe("useServerProfileActions roles CRUD", () => {
  it("createServerRole returns true on success and trims name", async () => {
    apiMock.createServerRole.mockResolvedValue(undefined);
    const args = makeArgs();
    const { result } = renderHook(() => useServerProfileActions(args));
    let ok = false;
    await act(async () => {
      ok = await result.current.handleCreateServerRole("  Mod  ");
    });
    expect(ok).toBe(true);
    expect(apiMock.createServerRole).toHaveBeenCalledWith("tok", "srv-1", "Mod");
    expect(args.pushToast).toHaveBeenCalledWith("server.roleSaved");
  });

  it("createServerRole returns false when name blank", async () => {
    const args = makeArgs();
    const { result } = renderHook(() => useServerProfileActions(args));
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.handleCreateServerRole("   ");
    });
    expect(ok).toBe(false);
    expect(apiMock.createServerRole).not.toHaveBeenCalled();
  });

  it("createServerRole returns false on api error", async () => {
    apiMock.createServerRole.mockRejectedValueOnce(new Error("e"));
    const args = makeArgs();
    const { result } = renderHook(() => useServerProfileActions(args));
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.handleCreateServerRole("x");
    });
    expect(ok).toBe(false);
  });

  it("renameServerRole trims inputs", async () => {
    apiMock.renameServerRole.mockResolvedValue(undefined);
    const args = makeArgs();
    const { result } = renderHook(() => useServerProfileActions(args));
    let ok = false;
    await act(async () => {
      ok = await result.current.handleRenameServerRole("  r-1  ", "  Name  ");
    });
    expect(ok).toBe(true);
    expect(apiMock.renameServerRole).toHaveBeenCalledWith("tok", "srv-1", "r-1", "Name");
  });

  it("renameServerRole returns false on missing inputs", async () => {
    const args = makeArgs();
    const { result } = renderHook(() => useServerProfileActions(args));
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.handleRenameServerRole("", "name");
    });
    expect(ok).toBe(false);
  });

  it("deleteServerRole returns true on success", async () => {
    apiMock.deleteServerRole.mockResolvedValue(undefined);
    const args = makeArgs();
    const { result } = renderHook(() => useServerProfileActions(args));
    let ok = false;
    await act(async () => {
      ok = await result.current.handleDeleteServerRole("r-1");
    });
    expect(ok).toBe(true);
    expect(args.pushToast).toHaveBeenCalledWith("server.roleDeleted");
  });

  it("deleteServerRole returns false on error", async () => {
    apiMock.deleteServerRole.mockRejectedValueOnce(new Error("e"));
    const args = makeArgs();
    const { result } = renderHook(() => useServerProfileActions(args));
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.handleDeleteServerRole("r-1");
    });
    expect(ok).toBe(false);
  });
});

describe("useServerProfileActions member roles & hidden access", () => {
  it("setServerMemberCustomRoles: success refreshes members", async () => {
    apiMock.setServerMemberCustomRoles.mockResolvedValue(undefined);
    apiMock.serverMembers.mockResolvedValue({ members: [{ id: "m1" }] });
    const args = makeArgs();
    const { result } = renderHook(() => useServerProfileActions(args));
    let ok = false;
    await act(async () => {
      ok = await result.current.handleSetServerMemberCustomRoles("u-1", ["r-1"]);
    });
    expect(ok).toBe(true);
    expect(apiMock.setServerMemberCustomRoles).toHaveBeenCalledWith("tok", "srv-1", "u-1", ["r-1"]);
    expect(args.setServerMembers).toHaveBeenCalledWith([{ id: "m1" }]);
  });

  it("setServerMemberCustomRoles: returns false on missing user", async () => {
    const args = makeArgs();
    const { result } = renderHook(() => useServerProfileActions(args));
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.handleSetServerMemberCustomRoles("  ", []);
    });
    expect(ok).toBe(false);
  });

  it("setServerMemberHiddenRoomAccess: success", async () => {
    apiMock.setServerMemberHiddenRoomAccess.mockResolvedValue(undefined);
    apiMock.serverMembers.mockResolvedValue({ members: [] });
    const args = makeArgs();
    const { result } = renderHook(() => useServerProfileActions(args));
    let ok = false;
    await act(async () => {
      ok = await result.current.handleSetServerMemberHiddenRoomAccess("u-1", ["room-1"]);
    });
    expect(ok).toBe(true);
    expect(apiMock.setServerMemberHiddenRoomAccess).toHaveBeenCalledWith("tok", "srv-1", "u-1", ["room-1"]);
  });

  it("setServerMemberHiddenRoomAccess: returns false on api error", async () => {
    apiMock.setServerMemberHiddenRoomAccess.mockRejectedValueOnce(new Error("e"));
    const args = makeArgs();
    const { result } = renderHook(() => useServerProfileActions(args));
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.handleSetServerMemberHiddenRoomAccess("u-1", []);
    });
    expect(ok).toBe(false);
    expect(args.pushToast).toHaveBeenCalledWith("e");
  });
});
