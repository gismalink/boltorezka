import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AuthController } from "./authController";

vi.mock("../api", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../api")>();
  return {
    ...orig,
    api: {
      ssoSession: vi.fn(),
      desktopHandoffAttemptCreate: vi.fn(),
      desktopHandoffCreate: vi.fn(),
      desktopHandoffAttemptStatus: vi.fn(),
      desktopHandoffExchange: vi.fn(),
      desktopHandoffComplete: vi.fn(),
      authLogout: vi.fn()
    }
  };
});

vi.mock("../telemetry", () => ({
  trackClientEvent: vi.fn()
}));

vi.mock("../transportRuntime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../transportRuntime")>();
  return {
    ...actual,
    resolveDesktopSsoReturnUrl: vi.fn((url: string) => `desk:${url}`),
    resolveSsoLogoutUrl: vi.fn((url: string) => `logout:${url}`),
    resolveSsoStartUrl: vi.fn((provider: string, returnUrl: string) => `start:${provider}:${returnUrl}`)
  };
});

vi.mock("../utils/authStorage", () => ({
  clearPersistedBearerToken: vi.fn()
}));

import { ApiError, api } from "../api";
import { trackClientEvent } from "../telemetry";
import { resolveDesktopSsoReturnUrl, resolveSsoLogoutUrl, resolveSsoStartUrl } from "../transportRuntime";
import { clearPersistedBearerToken } from "../utils/authStorage";

const apiMock = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

function makeOptions() {
  return {
    pushLog: vi.fn(),
    setToken: vi.fn(),
    setUser: vi.fn(),
    setDeletedAccountInfo: vi.fn()
  };
}

let originalLocation: Location;

beforeEach(() => {
  Object.values(apiMock).forEach((m) => m.mockReset());
  (trackClientEvent as ReturnType<typeof vi.fn>).mockReset();
  (resolveDesktopSsoReturnUrl as ReturnType<typeof vi.fn>).mockClear();
  (resolveSsoLogoutUrl as ReturnType<typeof vi.fn>).mockClear();
  (resolveSsoStartUrl as ReturnType<typeof vi.fn>).mockClear();
  (clearPersistedBearerToken as ReturnType<typeof vi.fn>).mockReset();

  originalLocation = window.location;
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: {
      href: "https://app.example/start",
      hostname: "app.example",
      origin: "https://app.example",
      replace: vi.fn()
    } as unknown as Location
  });
});

afterEach(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: originalLocation
  });
  delete (window as unknown as { datowaveDesktop?: unknown }).datowaveDesktop;
  vi.useRealTimers();
});

describe("AuthController.beginSso", () => {
  it("redirects through resolveSsoStartUrl with desktop-aware returnUrl", () => {
    const ctrl = new AuthController(makeOptions());
    ctrl.beginSso("google");
    expect(resolveDesktopSsoReturnUrl).toHaveBeenCalledWith("https://app.example/start");
    expect(resolveSsoStartUrl).toHaveBeenCalledWith("google", "desk:https://app.example/start");
    expect(window.location.href).toBe("start:google:desk:https://app.example/start");
  });
});

describe("AuthController.completeSso", () => {
  it("noop log when not authenticated and not silent", async () => {
    apiMock.ssoSession.mockResolvedValueOnce({ authenticated: false });
    const opts = makeOptions();
    await new AuthController(opts).completeSso();
    expect(opts.pushLog).toHaveBeenCalledWith("sso not authenticated yet");
    expect(opts.setToken).not.toHaveBeenCalled();
  });

  it("silent mode suppresses log", async () => {
    apiMock.ssoSession.mockResolvedValueOnce({ authenticated: false });
    const opts = makeOptions();
    await new AuthController(opts).completeSso({ silent: true });
    expect(opts.pushLog).not.toHaveBeenCalled();
  });

  it("sets token+user, clears deleted info, tracks success", async () => {
    apiMock.ssoSession.mockResolvedValueOnce({
      authenticated: true,
      token: "tok-1",
      user: { id: "u-1" }
    });
    const opts = makeOptions();
    await new AuthController(opts).completeSso();

    expect(opts.setToken).toHaveBeenCalledWith("tok-1");
    expect(opts.setUser).toHaveBeenCalledWith({ id: "u-1" });
    expect(opts.setDeletedAccountInfo).toHaveBeenCalledWith(null);
    expect(opts.pushLog).toHaveBeenCalledWith("sso session established");
    expect(trackClientEvent).toHaveBeenCalledWith(
      "auth.sso.complete.success",
      { userId: "u-1" },
      "tok-1"
    );
  });

  it("AccountDeleted ApiError sets deleted info with daysRemaining and purge scheduled", async () => {
    apiMock.ssoSession.mockRejectedValueOnce(
      new ApiError(403, { error: "AccountDeleted", daysRemaining: 7, purgeScheduledAt: "2026-03-01T00:00:00Z" })
    );
    const opts = makeOptions();
    await new AuthController(opts).completeSso();
    expect(opts.setDeletedAccountInfo).toHaveBeenCalledWith({
      daysRemaining: 7,
      purgeScheduledAt: "2026-03-01T00:00:00Z"
    });
    expect(opts.pushLog).toHaveBeenCalledWith(expect.stringContaining("sso failed:"));
  });

  it("AccountDeleted with missing fields uses defaults (30 days, null purge)", async () => {
    apiMock.ssoSession.mockRejectedValueOnce(new ApiError(403, { error: "AccountDeleted" }));
    const opts = makeOptions();
    await new AuthController(opts).completeSso();
    expect(opts.setDeletedAccountInfo).toHaveBeenCalledWith({
      daysRemaining: 30,
      purgeScheduledAt: null
    });
  });

  it("generic error logs and does not set deleted info", async () => {
    apiMock.ssoSession.mockRejectedValueOnce(new Error("boom"));
    const opts = makeOptions();
    await new AuthController(opts).completeSso();
    expect(opts.pushLog).toHaveBeenCalledWith("sso failed: boom");
    expect(opts.setDeletedAccountInfo).not.toHaveBeenCalled();
  });
});

describe("AuthController.startDesktopBrowserHandoff", () => {
  it("throws when attemptId missing", async () => {
    apiMock.desktopHandoffAttemptCreate.mockResolvedValueOnce({});
    const ctrl = new AuthController(makeOptions());
    await expect(ctrl.startDesktopBrowserHandoff("tok")).rejects.toThrow("desktop handoff attempt id is missing");
  });

  it("throws when code missing", async () => {
    apiMock.desktopHandoffAttemptCreate.mockResolvedValueOnce({ attemptId: "att-1" });
    apiMock.desktopHandoffCreate.mockResolvedValueOnce({});
    const ctrl = new AuthController(makeOptions());
    await expect(ctrl.startDesktopBrowserHandoff("tok")).rejects.toThrow("desktop handoff code is missing");
  });

  it("builds deep link, navigates, then replaces with completion error param on timeout", async () => {
    vi.useFakeTimers();
    (window.location as unknown as { href: string }).href =
      "https://app.example/x?desktop_handoff=1&desktop_handoff_bootstrap=1&keep=ok";
    apiMock.desktopHandoffAttemptCreate.mockResolvedValueOnce({ attemptId: "att-1" });
    apiMock.desktopHandoffCreate.mockResolvedValueOnce({ code: "code-1" });
    apiMock.desktopHandoffAttemptStatus.mockResolvedValue({ status: "pending" });

    const ctrl = new AuthController(makeOptions());
    const promise = ctrl.startDesktopBrowserHandoff("tok");
    // Fast-forward poll loop to exceed 60s timeout (40 polls of 1500ms = 60000ms).
    for (let i = 0; i < 45; i += 1) {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(1500);
    }
    await promise;

    expect((window.location as unknown as { href: string }).href).toMatch(/^datowave:\/\/app\.example\//);
    expect((window.location.replace as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      expect.stringContaining("desktop_handoff_error=timeout")
    );
    const replaceArg = (window.location.replace as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
    expect(replaceArg).toContain("desktop_handoff_attempt=att-1");
    expect(replaceArg).toContain("keep=ok");
    expect(replaceArg).not.toContain("desktop_handoff=1");
    expect(replaceArg).not.toContain("desktop_handoff_bootstrap=1");
  });

  it("on completed status removes the error param", async () => {
    vi.useFakeTimers();
    apiMock.desktopHandoffAttemptCreate.mockResolvedValueOnce({ attemptId: "att-1" });
    apiMock.desktopHandoffCreate.mockResolvedValueOnce({ code: "code-1" });
    apiMock.desktopHandoffAttemptStatus.mockResolvedValueOnce({ status: "completed" });

    const ctrl = new AuthController(makeOptions());
    const promise = ctrl.startDesktopBrowserHandoff("tok");
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(0);
    await promise;

    const replaceArg = (window.location.replace as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
    expect(replaceArg).not.toContain("desktop_handoff_error");
  });
});

describe("AuthController.completeDesktopHandoff", () => {
  it("throws when not authenticated", async () => {
    apiMock.desktopHandoffExchange.mockResolvedValueOnce({ authenticated: false });
    const ctrl = new AuthController(makeOptions());
    await expect(ctrl.completeDesktopHandoff("c", null)).rejects.toThrow("desktop handoff is not authenticated");
  });

  it("calls desktopHandoffComplete only when attemptId provided", async () => {
    apiMock.desktopHandoffExchange.mockResolvedValue({
      authenticated: true,
      token: "tok-1",
      user: { id: "u-1" }
    });

    const opts = makeOptions();
    const ctrl = new AuthController(opts);

    await ctrl.completeDesktopHandoff("c");
    expect(apiMock.desktopHandoffComplete).not.toHaveBeenCalled();

    await ctrl.completeDesktopHandoff("c", "att-2");
    expect(apiMock.desktopHandoffComplete).toHaveBeenCalledWith("tok-1", "att-2");

    expect(opts.setToken).toHaveBeenCalledWith("tok-1");
    expect(opts.setUser).toHaveBeenCalledWith({ id: "u-1" });
    expect(opts.setDeletedAccountInfo).toHaveBeenCalledWith(null);
    expect(opts.pushLog).toHaveBeenCalledWith("desktop handoff session established");
  });
});

describe("AuthController.logout", () => {
  it("clears token+user and redirects to SSO logout URL on web", async () => {
    apiMock.authLogout.mockResolvedValueOnce(undefined);
    const opts = makeOptions();
    await new AuthController(opts).logout("tok-1");

    expect(apiMock.authLogout).toHaveBeenCalledWith("tok-1");
    expect(clearPersistedBearerToken).toHaveBeenCalled();
    expect(opts.setToken).toHaveBeenCalledWith("");
    expect(opts.setUser).toHaveBeenCalledWith(null);
    expect(resolveSsoLogoutUrl).toHaveBeenCalledWith("https://app.example/start");
    expect(window.location.href).toBe("logout:https://app.example/start");
  });

  it("swallows authLogout error and still clears local state", async () => {
    apiMock.authLogout.mockRejectedValueOnce(new Error("net"));
    const opts = makeOptions();
    await new AuthController(opts).logout("tok-1");
    expect(opts.setToken).toHaveBeenCalledWith("");
    expect(clearPersistedBearerToken).toHaveBeenCalled();
  });

  it("desktop runtime: skips redirect and logs desktop completion", async () => {
    apiMock.authLogout.mockResolvedValueOnce(undefined);
    (window as unknown as { datowaveDesktop: unknown }).datowaveDesktop = {};

    const opts = makeOptions();
    await new AuthController(opts).logout("tok-1");

    expect(opts.pushLog).toHaveBeenCalledWith("desktop local logout complete");
    expect(resolveSsoLogoutUrl).not.toHaveBeenCalled();
    // href stays as initial value because no redirect was performed
    expect(window.location.href).toBe("https://app.example/start");
  });
});
