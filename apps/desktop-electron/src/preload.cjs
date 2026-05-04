const { contextBridge, ipcRenderer } = require("electron");

const updateStatusListeners = new Set();
const notificationOpenListeners = new Set();

ipcRenderer.on("desktop:update-status", (_event, payload) => {
  updateStatusListeners.forEach((listener) => {
    try {
      listener(payload);
    } catch {
      // Listener failures must not break bridge dispatch.
    }
  });
});

ipcRenderer.on("desktop:notification-open", (_event, payload) => {
  notificationOpenListeners.forEach((listener) => {
    try {
      listener(payload);
    } catch {
      // Listener failures must not break bridge dispatch.
    }
  });
});

contextBridge.exposeInMainWorld("datowaveDesktop", {
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
  },
  notifications: {
    show: (payload) => ipcRenderer.invoke("desktop:notifications:show", payload),
    onOpen: (listener) => {
      if (typeof listener !== "function") {
        return () => {};
      }

      notificationOpenListeners.add(listener);
      return () => {
        notificationOpenListeners.delete(listener);
      };
    }
  }
});
