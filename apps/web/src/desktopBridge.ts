export type DesktopBridgeInfo = {
  platform: string;
  version: string;
};

declare global {
  interface Window {
    boltorezkaDesktop?: DesktopBridgeInfo;
  }
}

export function getDesktopBridgeInfo(): DesktopBridgeInfo | null {
  const bridge = window.boltorezkaDesktop;
  if (!bridge) {
    return null;
  }

  const platform = String(bridge.platform || "").trim();
  const version = String(bridge.version || "").trim();
  if (!platform || !version) {
    return null;
  }

  return { platform, version };
}
