import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import { getDesktopBridgeInfo } from "./desktopBridge";
import "bootstrap-icons/font/bootstrap-icons.css";
import "./tailwind.css";
import "./styles.css";

const hostname = window.location.hostname.toLowerCase();
const isTestHost = hostname.startsWith("test.") || hostname.includes(".test.");
const desktopBridge = getDesktopBridgeInfo();
const isDesktop = Boolean(desktopBridge);
document.documentElement.dataset.runtime = isDesktop ? "desktop" : "web";
if (desktopBridge) {
  document.documentElement.dataset.desktopPlatform = desktopBridge.platform;
  document.documentElement.dataset.desktopElectron = desktopBridge.version;
}
document.title = isDesktop
  ? isTestHost ? "Boltorezka Desktop (test)" : "Boltorezka Desktop"
  : isTestHost ? "Boltorezka (test)" : "Boltorezka";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
