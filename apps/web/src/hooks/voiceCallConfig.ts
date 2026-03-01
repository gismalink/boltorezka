function normalizeIceServer(value: unknown): RTCIceServer | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const source = value as {
    urls?: unknown;
    username?: unknown;
    credential?: unknown;
  };

  const urls =
    typeof source.urls === "string"
      ? source.urls
      : Array.isArray(source.urls)
        ? source.urls.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        : null;

  if (!urls || (Array.isArray(urls) && urls.length === 0)) {
    return null;
  }

  const server: RTCIceServer = { urls };
  if (typeof source.username === "string") {
    server.username = source.username;
  }
  if (typeof source.credential === "string") {
    server.credential = source.credential;
  }

  return server;
}

function readIceServersFromEnv(): RTCIceServer[] {
  const fallback: RTCIceServer[] = [{ urls: ["stun:stun.l.google.com:19302"] }];
  const raw = String(import.meta.env.VITE_RTC_ICE_SERVERS_JSON || "").trim();
  if (!raw) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return fallback;
    }

    const normalized = parsed
      .map((item) => normalizeIceServer(item))
      .filter((item): item is RTCIceServer => Boolean(item));

    return normalized.length > 0 ? normalized : fallback;
  } catch {
    return fallback;
  }
}

function readPositiveIntFromEnv(name: string, fallback: number): number {
  const raw = Number(import.meta.env[name as keyof ImportMetaEnv] || "");
  if (!Number.isFinite(raw)) {
    return fallback;
  }
  return Math.max(0, Math.floor(raw));
}

const RTC_ICE_SERVERS = readIceServersFromEnv();
const RTC_ICE_TRANSPORT_POLICY: RTCIceTransportPolicy =
  String(import.meta.env.VITE_RTC_ICE_TRANSPORT_POLICY || "").trim().toLowerCase() === "relay"
    ? "relay"
    : "all";

export const RTC_CONFIG: RTCConfiguration = {
  iceServers: RTC_ICE_SERVERS,
  iceTransportPolicy: RTC_ICE_TRANSPORT_POLICY
};

export const RTC_RECONNECT_MAX_ATTEMPTS = readPositiveIntFromEnv("VITE_RTC_RECONNECT_MAX_ATTEMPTS", 3);
export const RTC_RECONNECT_BASE_DELAY_MS = Math.max(300, readPositiveIntFromEnv("VITE_RTC_RECONNECT_BASE_DELAY_MS", 1000));
export const RTC_RECONNECT_MAX_DELAY_MS = Math.max(
  RTC_RECONNECT_BASE_DELAY_MS,
  readPositiveIntFromEnv("VITE_RTC_RECONNECT_MAX_DELAY_MS", 8000)
);

export const ERROR_TOAST_THROTTLE_MS = 12000;
export const REMOTE_SPEAKING_ON_THRESHOLD = 0.055;
export const REMOTE_SPEAKING_OFF_THRESHOLD = 0.025;
export const REMOTE_SPEAKING_HOLD_MS = 450;
export const RTC_STATS_POLL_MS = 2500;
export const RTC_INBOUND_STALL_TICKS = 3;
export const TARGET_NOT_IN_ROOM_BLOCK_MS = 1500;
export const TARGET_NOT_IN_ROOM_RESYNC_GRACE_MS = 150;
