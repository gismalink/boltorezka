const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");
const { app, BrowserWindow, shell, desktopCapturer, ipcMain, Notification } = require("electron");

let autoUpdater = null;
try {
  ({ autoUpdater } = require("electron-updater"));
} catch {
  autoUpdater = null;
}
const isDev = !app.isPackaged;
const rendererUrl = process.env.ELECTRON_RENDERER_URL || "http://127.0.0.1:5173";
const desktopProtocol = "boltorezka";
const allowMultipleInstances = !app.isPackaged
  && String(process.env.ELECTRON_ALLOW_MULTIPLE_INSTANCES || "0") === "1";
const suppressExternalOpenForSmoke = String(process.env.ELECTRON_SMOKE_SUPPRESS_EXTERNAL_OPEN || "0") === "1";
const configuredUpdateChannel = String(process.env.ELECTRON_UPDATE_CHANNEL || (isDev ? "test" : "prod")).trim().toLowerCase();
const updateChannel = configuredUpdateChannel === "test" || configuredUpdateChannel === "prod"
  ? configuredUpdateChannel
  : "test";
const updateFeedBaseUrl = String(process.env.ELECTRON_UPDATE_FEED_BASE_URL || "").trim().replace(/\/+$/, "");
const updatePollIntervalMs = Math.max(0, Number(process.env.ELECTRON_UPDATE_POLL_INTERVAL_MS || 20 * 60 * 1000));
const updateAutoDownload = String(process.env.ELECTRON_UPDATE_AUTO_DOWNLOAD || "0") === "1";
const updateTraceOut = String(process.env.ELECTRON_DESKTOP_UPDATE_TRACE_OUT || "").trim();
let mainWindow = null;
let pendingProtocolUrl = "";
let updatePollTimer = null;
let securityHeadersConfigured = false;
const desktopUpdateState = {
  enabled: false,
  channel: updateChannel,
  feedUrl: "",
  lastEvent: "idle",
  availableVersion: "",
  downloadedVersion: "",
  lastCheckedAt: "",
  lastDownloadedAt: "",
  lastError: "",
  downloadPercent: 0,
  autoDownload: updateAutoDownload
};

function logDesktopUpdate(message) {
  console.log(`[desktop:update] ${message}`);
}

function writeDesktopUpdateTrace(event, patch = {}) {
  if (!updateTraceOut) {
    return;
  }

  try {
    fs.mkdirSync(path.dirname(updateTraceOut), { recursive: true });
    const payload = {
      ts: new Date().toISOString(),
      event,
      channel: updateChannel,
      isPackaged: app.isPackaged,
      appVersion: app.getVersion(),
      ...patch
    };
    fs.appendFileSync(updateTraceOut, `${JSON.stringify(payload)}\n`, "utf8");
  } catch {
    // Trace logging is best-effort.
  }
}

function getFeedPlatformPath() {
  if (process.platform === "darwin") {
    return "mac";
  }
  if (process.platform === "win32") {
    return "win";
  }
  return "linux";
}

function getDesktopRendererCsp() {
  // Packaged desktop renderer runs from file://, so CSP must be attached by Electron session headers.
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' https: wss:",
    "media-src 'self' blob:",
    "worker-src 'self' blob:"
  ].join("; ");
}

function configureDesktopSecurityHeaders(session) {
  if (securityHeadersConfigured || !app.isPackaged) {
    return;
  }

  const cspValue = getDesktopRendererCsp();
  session.webRequest.onHeadersReceived((details, callback) => {
    const headers = details.responseHeaders || {};
    headers["Content-Security-Policy"] = [cspValue];
    headers["X-Content-Type-Options"] = ["nosniff"];
    headers["X-Frame-Options"] = ["DENY"];
    headers["Referrer-Policy"] = ["strict-origin-when-cross-origin"];
    headers["Permissions-Policy"] = ["camera=(self), microphone=(self), geolocation=()"];
    callback({ responseHeaders: headers });
  });

  securityHeadersConfigured = true;
}

function notifyRendererUpdateStatus(event, payload = {}) {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("desktop:update-status", {
        event,
        channel: updateChannel,
        at: new Date().toISOString(),
        ...payload
      });
    }
  } catch {
    // Renderer notification is best-effort.
  }
}

function updateDesktopUpdateState(event, patch = {}) {
  Object.assign(desktopUpdateState, patch, {
    lastEvent: event,
    channel: updateChannel
  });
  writeDesktopUpdateTrace(event, {
    state: {
      ...desktopUpdateState
    }
  });
  notifyRendererUpdateStatus(event, patch);
}

function isUpdateRuntimeEnabled() {
  return Boolean(app.isPackaged && autoUpdater && updateFeedBaseUrl);
}

function registerUpdateIpcHandlers() {
  ipcMain.handle("desktop:update:get-state", async () => ({ ...desktopUpdateState }));

  ipcMain.handle("desktop:update:check", async () => {
    if (!isUpdateRuntimeEnabled()) {
      return {
        ok: false,
        reason: "update-runtime-disabled",
        state: { ...desktopUpdateState }
      };
    }

    try {
      await autoUpdater.checkForUpdates();
      return {
        ok: true,
        state: { ...desktopUpdateState }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      updateDesktopUpdateState("error", { lastError: message });
      return {
        ok: false,
        reason: message,
        state: { ...desktopUpdateState }
      };
    }
  });

  ipcMain.handle("desktop:update:download", async () => {
    if (!isUpdateRuntimeEnabled()) {
      return {
        ok: false,
        reason: "update-runtime-disabled",
        state: { ...desktopUpdateState }
      };
    }

    if (!desktopUpdateState.availableVersion) {
      return {
        ok: false,
        reason: "no-available-update",
        state: { ...desktopUpdateState }
      };
    }

    try {
      await autoUpdater.downloadUpdate();
      return {
        ok: true,
        state: { ...desktopUpdateState }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      updateDesktopUpdateState("error", { lastError: message });
      return {
        ok: false,
        reason: message,
        state: { ...desktopUpdateState }
      };
    }
  });

  ipcMain.handle("desktop:update:apply", async () => {
    if (!isUpdateRuntimeEnabled()) {
      return {
        ok: false,
        reason: "update-runtime-disabled",
        state: { ...desktopUpdateState }
      };
    }

    if (!desktopUpdateState.downloadedVersion) {
      return {
        ok: false,
        reason: "no-downloaded-update",
        state: { ...desktopUpdateState }
      };
    }

    updateDesktopUpdateState("applying", {
      lastError: ""
    });

    setTimeout(() => {
      try {
        autoUpdater.quitAndInstall(false, true);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        updateDesktopUpdateState("error", { lastError: message });
      }
    }, 350);

    return {
      ok: true,
      state: { ...desktopUpdateState }
    };
  });
}

function registerNotificationIpcHandlers() {
  ipcMain.handle("desktop:notifications:show", async (_event, payload) => {
    if (!Notification || !Notification.isSupported()) {
      return { ok: false, reason: "unsupported" };
    }

    const title = String(payload?.title || "").trim();
    const body = String(payload?.body || "").trim();
    const eventId = String(payload?.eventId || "").trim();
    if (!title) {
      return { ok: false, reason: "validation_error" };
    }

    try {
      const nativeNotification = new Notification({
        title,
        body,
        silent: false,
        urgency: "normal"
      });

      nativeNotification.on("click", () => {
        try {
          if (mainWindow && !mainWindow.isDestroyed()) {
            if (mainWindow.isMinimized()) {
              mainWindow.restore();
            }
            mainWindow.focus();
            mainWindow.webContents.send("desktop:notification-open", {
              eventId,
              at: new Date().toISOString()
            });
          }
        } catch {
          // Notification click routing is best-effort.
        }
      });

      nativeNotification.show();
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : "unknown_error"
      };
    }
  });
}

function startAutoUpdateOrchestration() {
  if (!app.isPackaged || !autoUpdater) {
    updateDesktopUpdateState("disabled", {
      enabled: false,
      feedUrl: "",
      lastError: "app-not-packaged-or-updater-missing"
    });
    return;
  }

  if (!updateFeedBaseUrl) {
    logDesktopUpdate("skipped: ELECTRON_UPDATE_FEED_BASE_URL is not configured");
    updateDesktopUpdateState("disabled", {
      enabled: false,
      feedUrl: "",
      lastError: "update-feed-base-url-missing"
    });
    return;
  }

  const feedPlatform = getFeedPlatformPath();
  const feedUrl = `${updateFeedBaseUrl}/${updateChannel}/${feedPlatform}`;

  try {
    autoUpdater.autoDownload = updateAutoDownload;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowDowngrade = updateChannel === "test";
    autoUpdater.allowPrerelease = updateChannel === "test";
    autoUpdater.setFeedURL({ provider: "generic", url: feedUrl });
    updateDesktopUpdateState("enabled", {
      enabled: true,
      feedUrl,
      lastError: "",
      downloadPercent: 0
    });
  } catch (error) {
    logDesktopUpdate(`feed init failed: ${error instanceof Error ? error.message : String(error)}`);
    updateDesktopUpdateState("error", {
      enabled: false,
      feedUrl,
      lastError: error instanceof Error ? error.message : String(error)
    });
    return;
  }

  autoUpdater.on("checking-for-update", () => {
    logDesktopUpdate(`checking channel=${updateChannel}`);
    updateDesktopUpdateState("checking", {
      lastCheckedAt: new Date().toISOString(),
      lastError: ""
    });
  });

  autoUpdater.on("update-available", (info) => {
    const version = String(info?.version || "unknown");
    logDesktopUpdate(`available version=${version} channel=${updateChannel}`);
    updateDesktopUpdateState("available", {
      availableVersion: version,
      lastError: "",
      downloadPercent: 0
    });
  });

  autoUpdater.on("update-not-available", (info) => {
    const version = String(info?.version || "unknown");
    logDesktopUpdate(`not-available current=${version} channel=${updateChannel}`);
    updateDesktopUpdateState("not-available", {
      availableVersion: "",
      downloadedVersion: "",
      lastError: "",
      downloadPercent: 0,
      lastCheckedAt: new Date().toISOString(),
      currentVersion: version
    });
  });

  autoUpdater.on("error", (error) => {
    const message = error instanceof Error ? error.message : String(error);
    logDesktopUpdate(`error: ${message}`);
    updateDesktopUpdateState("error", { lastError: message, message });
  });

  autoUpdater.on("download-progress", (progress) => {
    const percent = Number(progress?.percent || 0);
    updateDesktopUpdateState("download-progress", {
      percent: Number(percent.toFixed(2)),
      downloadPercent: Number(percent.toFixed(2)),
      lastError: ""
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    const version = String(info?.version || "unknown");
    logDesktopUpdate(`downloaded version=${version}`);
    updateDesktopUpdateState("downloaded", {
      downloadedVersion: version,
      availableVersion: version,
      lastDownloadedAt: new Date().toISOString(),
      downloadPercent: 100,
      lastError: ""
    });
  });

  const checkOnce = async () => {
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logDesktopUpdate(`check failed: ${message}`);
    }
  };

  logDesktopUpdate(`enabled channel=${updateChannel} feed=${feedUrl} autoDownload=${updateAutoDownload ? "1" : "0"}`);
  void checkOnce();

  if (updatePollIntervalMs > 0) {
    updatePollTimer = setInterval(() => {
      void checkOnce();
    }, updatePollIntervalMs);
  }
}

function isSameRendererOrigin(url) {
  try {
    return new URL(url).origin === new URL(rendererUrl).origin;
  } catch {
    return false;
  }
}

function getRendererEntryUrl() {
  if (isDev) {
    return `${rendererUrl.replace(/\/$/, "")}/`;
  }

  const indexPath = path.resolve(__dirname, "../../web/dist/index.html");
  return pathToFileURL(indexPath).toString();
}

function getDesktopWindowTitle() {
  const version = String(app.getVersion() || "").trim();
  if (!version) {
    return "Boltorezka";
  }
  return `Boltorezka v${version}`;
}

function withDesktopSsoParams(url, handoffCode = "", attemptId = "") {
  try {
    const parsed = new URL(url);
    if (handoffCode) {
      parsed.searchParams.set("desktop_sso_complete", "1");
      parsed.searchParams.set("desktop_sso_code", handoffCode);
    }
    if (attemptId) {
      parsed.searchParams.set("desktop_handoff_attempt", attemptId);
    }
    return parsed.toString();
  } catch {
    const fallback = new URL(`${rendererUrl.replace(/\/$/, "")}/`);
    if (handoffCode) {
      fallback.searchParams.set("desktop_sso_complete", "1");
      fallback.searchParams.set("desktop_sso_code", handoffCode);
    }
    if (attemptId) {
      fallback.searchParams.set("desktop_handoff_attempt", attemptId);
    }
    return fallback.toString();
  }
}

function resolveDesktopCallbackTarget(protocolUrl) {
  try {
    const parsed = new URL(protocolUrl);
    const normalizedPath = parsed.pathname.replace(/\/+$/, "");
    const isSsoCallback = parsed.protocol === `${desktopProtocol}:`
      && (normalizedPath === "/auth/sso-complete" || normalizedPath === "auth/sso-complete");
    if (!isSsoCallback) {
      return "";
    }

    const target = String(parsed.searchParams.get("target") || "").trim();
    let handoffCode = String(parsed.searchParams.get("desktop_sso_code") || "").trim();
    let attemptId = String(parsed.searchParams.get("attemptId") || "").trim();

    if (target) {
      try {
        const targetUrl = new URL(target);
        if (!handoffCode) {
          handoffCode = String(targetUrl.searchParams.get("desktop_sso_code") || "").trim();
        }
        if (!attemptId) {
          attemptId = String(targetUrl.searchParams.get("desktop_handoff_attempt") || "").trim();
        }
      } catch {
        // Ignore malformed target and rely on top-level params.
      }
    }

    if (isDev && target && isSameRendererOrigin(target)) {
      return withDesktopSsoParams(target, handoffCode, attemptId);
    }
    return withDesktopSsoParams(getRendererEntryUrl(), handoffCode, attemptId);
  } catch {
    return "";
  }
}

function handleProtocolUrl(rawUrl) {
  const target = resolveDesktopCallbackTarget(rawUrl);
  if (!target) {
    return;
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
    void mainWindow.loadURL(target);
    return;
  }

  pendingProtocolUrl = target;
}

function openExternal(url) {
  global.__boltorezkaLastExternalUrl = String(url || "");
  if (suppressExternalOpenForSmoke) {
    return;
  }
  void shell.openExternal(url);
}

async function clearDesktopSessionState(webContents, rendererOrigin) {
  try {
    await webContents.session.clearStorageData({
      origin: rendererOrigin,
      storages: ["cookies", "localstorage", "indexeddb", "serviceworkers", "cachestorage"]
    });
  } catch {
    // Best-effort cleanup.
  }
}

async function clearDesktopSessionStateAll(webContents) {
  try {
    await webContents.session.clearStorageData({
      storages: ["cookies", "localstorage", "indexeddb", "serviceworkers", "cachestorage"]
    });
  } catch {
    // Best-effort cleanup.
  }
}

if (!allowMultipleInstances) {
  const hasInstanceLock = app.requestSingleInstanceLock();
  if (!hasInstanceLock) {
    app.quit();
  }
}

function createMainWindow() {
  const windowTitle = getDesktopWindowTitle();
  const window = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: windowTitle,
    autoHideMenuBar: true,
    backgroundColor: "#0b0f14",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true
    }
  });

  const diagnosticsOut = String(process.env.ELECTRON_DESKTOP_DIAGNOSTICS_OUT || "").trim();
  if (diagnosticsOut) {
    try {
      fs.mkdirSync(path.dirname(diagnosticsOut), { recursive: true });
      const prefs = window.webContents.getLastWebPreferences();
      const payload = {
        ts: new Date().toISOString(),
        isPackaged: app.isPackaged,
        appVersion: app.getVersion(),
        platform: process.platform,
        arch: process.arch,
        electronVersion: process.versions.electron,
        chromeVersion: process.versions.chrome,
        rendererUrl: isDev ? rendererUrl : "file://.../web/dist/index.html",
        webPreferences: {
          contextIsolation: Boolean(prefs.contextIsolation),
          sandbox: Boolean(prefs.sandbox),
          nodeIntegration: Boolean(prefs.nodeIntegration),
          webSecurity: Boolean(prefs.webSecurity)
        }
      };
      fs.writeFileSync(diagnosticsOut, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    } catch {
      // Diagnostics are best-effort and must never break app startup.
    }
  }

  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: "deny" };
  });

  configureDesktopSecurityHeaders(window.webContents.session);

  window.webContents.session.setDisplayMediaRequestHandler(async (_request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ["screen", "window"],
        thumbnailSize: { width: 0, height: 0 }
      });

      if (!Array.isArray(sources) || sources.length === 0) {
        callback({ video: null, audio: null });
        return;
      }

      callback({ video: sources[0], audio: null });
    } catch {
      callback({ video: null, audio: null });
    }
  }, {
    useSystemPicker: true
  });

  window.webContents.on("page-title-updated", (event) => {
    // Keep native title deterministic so test builds clearly show exact version.
    event.preventDefault();
    window.setTitle(windowTitle);
  });

  window.webContents.on("did-fail-load", (_event, code, description, validatedURL) => {
    console.error(`[desktop] did-fail-load code=${code} desc=${description} url=${validatedURL}`);
  });

  const handleDesktopLocalLogoutNavigation = (url) => {
    try {
      const parsed = new URL(url);
      const rendererOrigin = new URL(rendererUrl).origin;
      const isSameOrigin = parsed.origin === rendererOrigin;
      const isSsoLogout = parsed.pathname === "/v1/auth/sso/logout";
      if (isSameOrigin && isSsoLogout) {
        const target = `${rendererUrl.replace(/\/$/, "")}/?desktop_logged_out=1`;
        void clearDesktopSessionState(window.webContents, rendererOrigin)
          .finally(() => {
            void window.loadURL(target);
          });
        return true;
      }

      const isCentralAuthHost = /(test\.)?auth\.gismalink\.art$/i.test(parsed.hostname);
      const isCentralLogoutPath = parsed.pathname === "/auth/logout";
      const returnUrlRaw = String(parsed.searchParams.get("returnUrl") || "").trim();

      if (!isCentralAuthHost || !isCentralLogoutPath || !returnUrlRaw) {
        return false;
      }

      const returnUrl = new URL(returnUrlRaw);
      if (returnUrl.origin !== rendererOrigin) {
        return false;
      }

      const target = `${rendererUrl.replace(/\/$/, "")}/?desktop_logged_out=1`;
      void clearDesktopSessionState(window.webContents, rendererOrigin)
        .finally(() => {
          void window.loadURL(target);
        });
      return true;
    } catch {
      return false;
    }
  };

  const shouldOpenExternalNavigation = (url) => {
    try {
      const parsed = new URL(url);
      const rendererOrigin = new URL(rendererUrl).origin;
      const isSameOrigin = parsed.origin === rendererOrigin;
      const isSsoStart = parsed.pathname === "/v1/auth/sso/start";

      // Keep SSO start in external browser for passkeys/password managers.
      if (isSameOrigin && isSsoStart) {
        return true;
      }

      return false;
    } catch {
      return false;
    }
  };

  window.webContents.on("will-navigate", (event, url) => {
    if (handleDesktopLocalLogoutNavigation(url)) {
      event.preventDefault();
      return;
    }

    if (shouldOpenExternalNavigation(url)) {
      event.preventDefault();
      openExternal(url);
      return;
    }

    const allowedPrefix = isDev ? rendererUrl : "file://";
    if (!url.startsWith(allowedPrefix)) {
      event.preventDefault();
      openExternal(url);
    }
  });

  window.webContents.on("will-redirect", (event, url) => {
    if (handleDesktopLocalLogoutNavigation(url)) {
      event.preventDefault();
      return;
    }

    if (shouldOpenExternalNavigation(url)) {
      event.preventDefault();
      openExternal(url);
      return;
    }

    const allowedPrefix = isDev ? rendererUrl : "file://";
    if (!url.startsWith(allowedPrefix)) {
      event.preventDefault();
      openExternal(url);
    }
  });

  if (isDev) {
    const initialTarget = pendingProtocolUrl || rendererUrl;
    void clearDesktopSessionStateAll(window.webContents)
      .finally(() => {
        void window.loadURL(initialTarget);
      });
  } else {
    const initialTarget = pendingProtocolUrl || getRendererEntryUrl();
    void window.loadURL(initialTarget);
  }

  pendingProtocolUrl = "";

  return window;
}

if (process.defaultApp && process.argv.length >= 2) {
  app.setAsDefaultProtocolClient(desktopProtocol, process.execPath, [path.resolve(process.argv[1])]);
} else {
  app.setAsDefaultProtocolClient(desktopProtocol);
}

app.on("open-url", (event, url) => {
  event.preventDefault();
  handleProtocolUrl(url);
});

app.whenReady().then(() => {
  registerUpdateIpcHandlers();
  registerNotificationIpcHandlers();
  mainWindow = createMainWindow();
  startAutoUpdateOrchestration();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
    }
  });
});

app.on("second-instance", (_event, argv) => {
  const protocolArg = (argv || []).find((value) => String(value || "").startsWith(`${desktopProtocol}://`));
  if (protocolArg) {
    handleProtocolUrl(protocolArg);
  }

  const [window] = BrowserWindow.getAllWindows();
  if (!window) {
    mainWindow = createMainWindow();
    return;
  }

  if (window.isMinimized()) {
    window.restore();
  }
  window.focus();
});

app.on("window-all-closed", () => {
  if (updatePollTimer) {
    clearInterval(updatePollTimer);
    updatePollTimer = null;
  }

  if (process.platform !== "darwin") {
    app.quit();
  }
});
