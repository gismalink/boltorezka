const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("boltorezkaDesktop", {
  platform: process.platform,
  version: process.versions.electron
});
