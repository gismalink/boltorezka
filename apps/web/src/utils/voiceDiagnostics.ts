type VoiceCounterKey =
  | "runtimePeers"
  | "runtimeAudioElements"
  | "runtimeLocalStreams"
  | "runtimeReconnectTimers"
  | "meterSessions"
  | "meterStreams"
  | "meterAudioContexts";

type VoiceDiagnosticsCounters = Record<VoiceCounterKey, number>;

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

  const snapshot = getVoiceDiagnosticsSnapshot();
  if (extra) {
    console.info(`[voice-diag] ${label}`, { ...snapshot, ...extra });
    return;
  }

  console.info(`[voice-diag] ${label}`, snapshot);
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
