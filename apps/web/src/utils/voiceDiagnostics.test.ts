import {
  decrementVoiceCounter,
  getVoiceDiagnosticsSnapshot,
  incrementVoiceCounter,
  resetVoiceDiagnostics,
  setVoiceDiagnosticsEnabled
} from "./voiceDiagnostics";

describe("voiceDiagnostics counters", () => {
  beforeEach(() => {
    setVoiceDiagnosticsEnabled(false);
    resetVoiceDiagnostics();
  });

  it("increments and decrements counters", () => {
    expect(getVoiceDiagnosticsSnapshot().runtimePeers).toBe(0);

    incrementVoiceCounter("runtimePeers");
    incrementVoiceCounter("runtimePeers", 2);
    expect(getVoiceDiagnosticsSnapshot().runtimePeers).toBe(3);

    decrementVoiceCounter("runtimePeers");
    expect(getVoiceDiagnosticsSnapshot().runtimePeers).toBe(2);
  });

  it("never allows negative counter values", () => {
    decrementVoiceCounter("meterStreams", 100);
    expect(getVoiceDiagnosticsSnapshot().meterStreams).toBe(0);

    incrementVoiceCounter("meterStreams", 1);
    decrementVoiceCounter("meterStreams", 2);
    expect(getVoiceDiagnosticsSnapshot().meterStreams).toBe(0);
  });

  it("resets all counters", () => {
    incrementVoiceCounter("runtimeLocalStreams", 2);
    incrementVoiceCounter("meterAudioContexts", 3);
    incrementVoiceCounter("runtimeReconnectTimers", 1);

    resetVoiceDiagnostics();
    expect(getVoiceDiagnosticsSnapshot()).toEqual({
      runtimePeers: 0,
      runtimeAudioElements: 0,
      runtimeLocalStreams: 0,
      runtimeReconnectTimers: 0,
      meterSessions: 0,
      meterStreams: 0,
      meterAudioContexts: 0
    });
  });
});
