const path = require("path");
const { app, BrowserWindow, shell } = require("electron");

const isDev = !app.isPackaged;
const rendererUrl = process.env.ELECTRON_RENDERER_URL || "http://127.0.0.1:5173";

const hasInstanceLock = app.requestSingleInstanceLock();
if (!hasInstanceLock) {
  app.quit();
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
