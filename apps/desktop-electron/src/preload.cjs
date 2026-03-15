const { contextBridge, ipcRenderer } = require("electron");

const updateStatusListeners = new Set();

ipcRenderer.on("desktop:update-status", (_event, payload) => {
  updateStatusListeners.forEach((listener) => {
    try {
      listener(payload);
    } catch {
      // Listener failures must not break bridge dispatch.
    }
  });
});

contextBridge.exposeInMainWorld("boltorezkaDesktop", {
  platform: process.platform,
  version: process.versions.electron,
  update: {
    getStatus: () => ipcRenderer.invoke("desktop:update:get-state"),
    checkForUpdates: () => ipcRenderer.invoke("desktop:update:check"),
    downloadUpdate: () => ipcRenderer.invoke("desktop:update:download"),
    applyUpdate: () => ipcRenderer.invoke("desktop:update:apply"),
    onStatus: (listener) => {
      if (typeof listener !== "function") {
        return () => {};
      }
      updateStatusListeners.add(listener);
      return () => {
        updateStatusListeners.delete(listener);
      };
    }
  }
});
