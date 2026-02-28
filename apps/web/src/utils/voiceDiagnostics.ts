type VoiceCounterKey =
  | "runtimePeers"
  | "runtimeAudioElements"
  | "runtimeLocalStreams"
  | "runtimeReconnectTimers"
  | "meterSessions"
  | "meterStreams"
  | "meterAudioContexts";

type VoiceDiagnosticsCounters = Record<VoiceCounterKey, number>;

type LogState = {
  at: number;
  skipped: number;
};

const counters: VoiceDiagnosticsCounters = {
  runtimePeers: 0,
  runtimeAudioElements: 0,
  runtimeLocalStreams: 0,
  runtimeReconnectTimers: 0,
  meterSessions: 0,
  meterStreams: 0,
  meterAudioContexts: 0
};

let forceEnabled = false;
const LOG_MIN_INTERVAL_MS = 2000;
const logStateByLabel = new Map<string, LogState>();

function clampNonNegative(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return value < 0 ? 0 : Math.floor(value);
}

function isDiagnosticsEnabled(): boolean {
  if (forceEnabled) {
    return true;
  }

  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.localStorage.getItem("boltorezka_voice_debug") === "1";
  } catch {
    return false;
  }
}

export function setVoiceDiagnosticsEnabled(next: boolean) {
  forceEnabled = next;
}

export function resetVoiceDiagnostics() {
  (Object.keys(counters) as VoiceCounterKey[]).forEach((key) => {
    counters[key] = 0;
  });
  logStateByLabel.clear();
}

export function getVoiceDiagnosticsSnapshot(): VoiceDiagnosticsCounters {
  return { ...counters };
}

export function incrementVoiceCounter(key: VoiceCounterKey, delta = 1): number {
  counters[key] = clampNonNegative(counters[key] + delta);
  return counters[key];
}

export function decrementVoiceCounter(key: VoiceCounterKey, delta = 1): number {
  counters[key] = clampNonNegative(counters[key] - delta);
  return counters[key];
}

export function logVoiceDiagnostics(label: string, extra?: Record<string, unknown>) {
  if (!isDiagnosticsEnabled()) {
    return;
  }

  const now = Date.now();
  const previous = logStateByLabel.get(label);
  if (previous && now - previous.at < LOG_MIN_INTERVAL_MS) {
    previous.skipped += 1;
    logStateByLabel.set(label, previous);
    return;
  }

  const skippedSinceLast = previous?.skipped || 0;
  logStateByLabel.set(label, { at: now, skipped: 0 });

  const snapshot = getVoiceDiagnosticsSnapshot();
  const payload = skippedSinceLast > 0
    ? { ...snapshot, skippedSinceLast, ...(extra || {}) }
    : extra
      ? { ...snapshot, ...extra }
      : snapshot;

  if (extra) {
    console.info(`[voice-diag] ${label}`, payload);
    return;
  }

  console.info(`[voice-diag] ${label}`, payload);
}

if (typeof window !== "undefined") {
  const diagnosticsApi = {
    snapshot: getVoiceDiagnosticsSnapshot,
    reset: resetVoiceDiagnostics,
    enable: () => setVoiceDiagnosticsEnabled(true),
    disable: () => setVoiceDiagnosticsEnabled(false)
  };

  (window as Window & { __boltVoiceDiagnostics?: typeof diagnosticsApi }).__boltVoiceDiagnostics = diagnosticsApi;
}
