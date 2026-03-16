export type DesktopBridgeInfo = {
  platform: string;
  version: string;
};

export type DesktopMediaKind = "microphone" | "camera";

type DesktopMediaAccessStatusResult = {
  ok: boolean;
  reason?: string;
  status: string;
};

type DesktopMediaRequestAccessResult = {
  ok: boolean;
  granted: boolean;
  reason?: string;
  status: string;
};

export type DesktopMediaBridge = {
  getAccessStatus: (kind: DesktopMediaKind) => Promise<DesktopMediaAccessStatusResult>;
  requestAccess: (kind: DesktopMediaKind) => Promise<DesktopMediaRequestAccessResult>;
};

export type DesktopUpdateEvent =
  | "idle"
  | "enabled"
  | "disabled"
  | "checking"
  | "available"
  | "not-available"
  | "download-progress"
  | "downloaded"
  | "applying"
  | "error";

export type DesktopUpdateStatus = {
  enabled: boolean;
  channel: "test" | "prod" | string;
  feedUrl: string;
  lastEvent: DesktopUpdateEvent;
  availableVersion: string;
  downloadedVersion: string;
  lastCheckedAt: string;
  lastDownloadedAt: string;
  lastError: string;
  downloadPercent: number;
  autoDownload: boolean;
};

type DesktopUpdateStatusEvent = {
  event: DesktopUpdateEvent;
  channel?: string;
  at?: string;
  version?: string;
  currentVersion?: string;
  percent?: number;
  message?: string;
  lastError?: string;
};

type DesktopUpdateActionResult = {
  ok: boolean;
  reason?: string;
  state?: DesktopUpdateStatus;
};

export type DesktopUpdateBridge = {
  getStatus: () => Promise<DesktopUpdateStatus>;
  checkForUpdates: () => Promise<DesktopUpdateActionResult>;
  downloadUpdate: () => Promise<DesktopUpdateActionResult>;
  applyUpdate: () => Promise<DesktopUpdateActionResult>;
  onStatus: (listener: (event: DesktopUpdateStatusEvent) => void) => () => void;
};

type DesktopBridgeWithUpdate = DesktopBridgeInfo & {
  media?: DesktopMediaBridge;
  update?: DesktopUpdateBridge;
};

export function getDesktopBridgeInfo(): DesktopBridgeInfo | null {
  const bridge = (window as Window & { boltorezkaDesktop?: DesktopBridgeInfo }).boltorezkaDesktop;
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

export function getDesktopUpdateBridge(): DesktopUpdateBridge | null {
  const bridge = (window as Window & { boltorezkaDesktop?: DesktopBridgeWithUpdate }).boltorezkaDesktop;
  if (!bridge?.update) {
    return null;
  }

  const updateBridge = bridge.update;
  if (
    typeof updateBridge.getStatus !== "function"
    || typeof updateBridge.checkForUpdates !== "function"
    || typeof updateBridge.downloadUpdate !== "function"
    || typeof updateBridge.applyUpdate !== "function"
    || typeof updateBridge.onStatus !== "function"
  ) {
    return null;
  }

  return updateBridge;
}

export function getDesktopMediaBridge(): DesktopMediaBridge | null {
  const bridge = (window as Window & { boltorezkaDesktop?: DesktopBridgeWithUpdate }).boltorezkaDesktop;
  if (!bridge?.media) {
    return null;
  }

  const mediaBridge = bridge.media;
  if (
    typeof mediaBridge.getAccessStatus !== "function"
    || typeof mediaBridge.requestAccess !== "function"
  ) {
    return null;
  }

  return mediaBridge;
}
