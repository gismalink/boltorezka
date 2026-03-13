import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import { getDesktopBridgeInfo } from "./desktopBridge";
import { trackClientEvent } from "./telemetry";
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

const searchParams = new URLSearchParams(window.location.search);
if (isDesktop) {
  const smokeWindow = window as Window & {
    __boltorezkaDesktopSmokeTrack?: () => void;
  };

  smokeWindow.__boltorezkaDesktopSmokeTrack = () => {
    trackClientEvent("desktop_smoke_probe", {
      probe: true,
      source: "desktop_smoke"
    });
  };

  if (searchParams.get("desktop_smoke_telemetry") === "1") {
    smokeWindow.__boltorezkaDesktopSmokeTrack();
  }
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
