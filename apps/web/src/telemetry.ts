type DesktopBridgeInfo = {
  platform?: string;
  version?: string;
};

declare global {
  interface Window {
    boltorezkaDesktop?: DesktopBridgeInfo;
  }
}

function getRuntimeTelemetryMeta() {
  const desktop = typeof window !== "undefined" ? window.boltorezkaDesktop : undefined;
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
