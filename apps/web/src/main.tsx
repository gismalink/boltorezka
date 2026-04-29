/**
 * Точка входа web-приложения Datute (Boltorezka).
 *
 * Что делает:
 * - Определяет окружение (web/desktop, prod/test) и проставляет data-атрибуты на <html>.
 * - Ставит правильный document.title для контура.
 * - Регистрирует desktop smoke-пробу (опционально, по query-параметру).
 * - Маршрутизирует /privacy, /terms, /cookies, /contacts на отдельную легальную страницу.
 * - Монтирует основной <App/> в #root внутри ErrorBoundary и StrictMode.
 *
 * Бизнес-логики тут быть не должно — только bootstrap.
 */

import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import { LegalStandalonePage } from "./LegalStandalonePage";
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
  ? isTestHost ? "Datute Desktop (test)" : "Datute Desktop"
  : isTestHost ? "Datute (test)" : "Datute";

const searchParams = new URLSearchParams(window.location.search);
const legalRoutes = new Set(["/privacy", "/terms", "/cookies", "/contacts"]);
const currentPathname = window.location.pathname.toLowerCase();
const normalizedPathname = currentPathname.endsWith("/") && currentPathname.length > 1
  ? currentPathname.slice(0, -1)
  : currentPathname;
const isLegalRoute = legalRoutes.has(normalizedPathname);
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
      {isLegalRoute ? <LegalStandalonePage /> : <App />}
    </ErrorBoundary>
  </React.StrictMode>
);
