/**
 * telemetry.ts — клиентский трекер событий web/desktop UI.
 *
 * Назначение:
 * - Собирает метаинформацию о runtime (web/desktop, platform, версия Electron) из window.datowaveDesktop.
 * - Отправляет события на сервер по `POST /v1/telemetry/web` (keepalive: true, ошибки сети глушатся).
 * - Подкладывает Bearer-токен, если он передан вызывающим кодом.
 *
 * Все ошибки сети поглощаются (.catch(() => {})) — телеметрия не должна влиять на UX.
 */
type DesktopBridgeInfo = {
  platform?: string;
  version?: string;
};

declare global {
  interface Window {
    datowaveDesktop?: DesktopBridgeInfo;
  }
}

function getRuntimeTelemetryMeta() {
  const desktop = typeof window !== "undefined" ? window.datowaveDesktop : undefined;
  if (desktop && desktop.platform && desktop.version) {
    return {
      runtime: "desktop",
      platform: String(desktop.platform),
      electronVersion: String(desktop.version)
    };
  }

  return {
    runtime: "web"
  };
}

export function trackClientEvent(
  event: string,
  payload: Record<string, unknown> = {},
  token?: string
) {
  const headers: Record<string, string> = {
    "content-type": "application/json"
  };

  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  fetch("/v1/telemetry/web", {
    method: "POST",
    headers,
    keepalive: true,
    body: JSON.stringify({
      event,
      meta: {
        ...getRuntimeTelemetryMeta(),
        ...payload
      }
    })
  }).catch(() => {});
}
