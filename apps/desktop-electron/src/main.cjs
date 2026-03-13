const path = require("path");
const fs = require("fs");
const { app, BrowserWindow, shell } = require("electron");

const isDev = !app.isPackaged;
const rendererUrl = process.env.ELECTRON_RENDERER_URL || "http://127.0.0.1:5173";
const allowMultipleInstances = !app.isPackaged
  && String(process.env.ELECTRON_ALLOW_MULTIPLE_INSTANCES || "0") === "1";

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
    shell.openExternal(url);
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    const allowedPrefix = isDev ? rendererUrl : "file://";
    if (!url.startsWith(allowedPrefix)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  if (isDev) {
    void window.loadURL(rendererUrl);
  } else {
    const indexPath = path.resolve(__dirname, "../../web/dist/index.html");
    void window.loadFile(indexPath);
  }

  return window;
}

app.whenReady().then(() => {
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("second-instance", () => {
  const [window] = BrowserWindow.getAllWindows();
  if (!window) {
    createMainWindow();
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
