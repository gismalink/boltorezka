const path = require("path");
const fs = require("fs");
const { app, BrowserWindow, shell, desktopCapturer } = require("electron");

const isDev = !app.isPackaged;
const rendererUrl = process.env.ELECTRON_RENDERER_URL || "http://127.0.0.1:5173";
const desktopProtocol = "boltorezka";
const allowMultipleInstances = !app.isPackaged
  && String(process.env.ELECTRON_ALLOW_MULTIPLE_INSTANCES || "0") === "1";
const suppressExternalOpenForSmoke = String(process.env.ELECTRON_SMOKE_SUPPRESS_EXTERNAL_OPEN || "0") === "1";
let mainWindow = null;
let pendingProtocolUrl = "";

function isSameRendererOrigin(url) {
  try {
    return new URL(url).origin === new URL(rendererUrl).origin;
  } catch {
    return false;
  }
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

    const handoffCode = String(parsed.searchParams.get("desktop_sso_code") || "").trim();
    const attemptId = String(parsed.searchParams.get("attemptId") || "").trim();
    const target = String(parsed.searchParams.get("target") || "").trim();
    if (target && isSameRendererOrigin(target)) {
      return withDesktopSsoParams(target, handoffCode, attemptId);
    }
    return withDesktopSsoParams(`${rendererUrl.replace(/\/$/, "")}/`, handoffCode, attemptId);
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
  const window = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
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
    const indexPath = path.resolve(__dirname, "../../web/dist/index.html");
    void window.loadFile(indexPath);
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
  mainWindow = createMainWindow();

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
  if (process.platform !== "darwin") {
    app.quit();
  }
});
