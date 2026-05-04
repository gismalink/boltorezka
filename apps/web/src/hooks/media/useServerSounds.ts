import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type ServerSoundEvent =
  | "member_join"
  | "member_leave"
  | "server_disconnected"
  | "chat_message"
  | "self_disconnected"
  | "self_joined_channel"
  | "self_mic_on"
  | "self_mic_off"
  | "self_audio_on"
  | "self_audio_off";

type ServerSoundSettings = {
  masterVolume: number;
  enabledByEvent: Record<ServerSoundEvent, boolean>;
};

const SETTINGS_KEY = "datowave_server_sounds";

const DEFAULT_SETTINGS: ServerSoundSettings = {
  masterVolume: 65,
  enabledByEvent: {
    member_join: true,
    member_leave: true,
    server_disconnected: true,
    chat_message: true,
    self_disconnected: true,
    self_joined_channel: true,
    self_mic_on: true,
    self_mic_off: true,
    self_audio_on: true,
    self_audio_off: true
  }
};

function clampVolume(value: number) {
  if (!Number.isFinite(value)) {
    return DEFAULT_SETTINGS.masterVolume;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

export function useServerSounds() {
  const [settings, setSettings] = useState<ServerSoundSettings>(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) {
        return DEFAULT_SETTINGS;
      }

      const parsed = JSON.parse(raw) as Partial<ServerSoundSettings>;
      return {
        masterVolume: clampVolume(parsed.masterVolume ?? DEFAULT_SETTINGS.masterVolume),
        enabledByEvent: {
          member_join: parsed.enabledByEvent?.member_join ?? DEFAULT_SETTINGS.enabledByEvent.member_join,
          member_leave: parsed.enabledByEvent?.member_leave ?? DEFAULT_SETTINGS.enabledByEvent.member_leave,
          server_disconnected: parsed.enabledByEvent?.server_disconnected ?? DEFAULT_SETTINGS.enabledByEvent.server_disconnected,
          chat_message: parsed.enabledByEvent?.chat_message ?? DEFAULT_SETTINGS.enabledByEvent.chat_message,
          self_disconnected: parsed.enabledByEvent?.self_disconnected ?? DEFAULT_SETTINGS.enabledByEvent.self_disconnected,
          self_joined_channel: parsed.enabledByEvent?.self_joined_channel ?? DEFAULT_SETTINGS.enabledByEvent.self_joined_channel,
          self_mic_on: parsed.enabledByEvent?.self_mic_on ?? DEFAULT_SETTINGS.enabledByEvent.self_mic_on,
          self_mic_off: parsed.enabledByEvent?.self_mic_off ?? DEFAULT_SETTINGS.enabledByEvent.self_mic_off,
          self_audio_on: parsed.enabledByEvent?.self_audio_on ?? DEFAULT_SETTINGS.enabledByEvent.self_audio_on,
          self_audio_off: parsed.enabledByEvent?.self_audio_off ?? DEFAULT_SETTINGS.enabledByEvent.self_audio_off
        }
      };
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  const ensureAudioContext = useCallback(async () => {
    const Context = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) {
      return null;
    }

    if (!audioContextRef.current) {
      audioContextRef.current = new Context();
    }

    if (audioContextRef.current.state === "suspended") {
      try {
        await audioContextRef.current.resume();
      } catch {
        return null;
      }
    }

    return audioContextRef.current;
  }, []);

  const playTone = useCallback((context: AudioContext, frequency: number, startTime: number, durationSec: number, volume: number) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(frequency, startTime);

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), startTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSec);

    oscillator.connect(gain);
    gain.connect(context.destination);

    oscillator.start(startTime);
    oscillator.stop(startTime + durationSec + 0.01);
  }, []);

  const playServerSound = useCallback(async (event: ServerSoundEvent) => {
    if (!settings.enabledByEvent[event]) {
      return;
    }

    const master = settings.masterVolume / 100;
    if (master <= 0) {
      return;
    }

    const context = await ensureAudioContext();
    if (!context) {
      return;
    }

    const baseTime = context.currentTime + 0.005;
    const toneVolume = 0.09 * master;

    if (event === "member_join") {
      playTone(context, 660, baseTime, 0.08, toneVolume);
      playTone(context, 880, baseTime + 0.085, 0.09, toneVolume);
      return;
    }

    if (event === "member_leave") {
      playTone(context, 620, baseTime, 0.08, toneVolume);
      playTone(context, 420, baseTime + 0.085, 0.1, toneVolume);
      return;
    }

    if (event === "server_disconnected") {
      playTone(context, 520, baseTime, 0.1, toneVolume);
      playTone(context, 390, baseTime + 0.11, 0.11, toneVolume);
      playTone(context, 290, baseTime + 0.23, 0.12, toneVolume);
      return;
    }

    if (event === "self_disconnected") {
      playTone(context, 470, baseTime, 0.09, toneVolume);
      playTone(context, 340, baseTime + 0.1, 0.1, toneVolume);
      playTone(context, 250, baseTime + 0.215, 0.11, toneVolume);
      return;
    }

    if (event === "self_joined_channel") {
      playTone(context, 740, baseTime, 0.08, toneVolume);
      playTone(context, 990, baseTime + 0.085, 0.09, toneVolume);
      return;
    }

    // Микрофон включён — короткий восходящий блип.
    if (event === "self_mic_on") {
      playTone(context, 700, baseTime, 0.05, toneVolume);
      playTone(context, 1040, baseTime + 0.055, 0.06, toneVolume);
      return;
    }

    // Микрофон выключен — короткий нисходящий блип.
    if (event === "self_mic_off") {
      playTone(context, 700, baseTime, 0.05, toneVolume);
      playTone(context, 420, baseTime + 0.055, 0.06, toneVolume);
      return;
    }

    // Наушники включены — более низкий восходящий блип, отличающийся от микрофона.
    if (event === "self_audio_on") {
      playTone(context, 520, baseTime, 0.06, toneVolume);
      playTone(context, 780, baseTime + 0.065, 0.07, toneVolume);
      return;
    }

    // Наушники выключены — парный нисходящий блип.
    if (event === "self_audio_off") {
      playTone(context, 520, baseTime, 0.06, toneVolume);
      playTone(context, 320, baseTime + 0.065, 0.07, toneVolume);
      return;
    }

    playTone(context, 910, baseTime, 0.06, toneVolume);
    playTone(context, 700, baseTime + 0.065, 0.06, toneVolume * 0.8);
  }, [ensureAudioContext, playTone, settings.enabledByEvent, settings.masterVolume]);

  const setMasterVolume = useCallback((value: number) => {
    setSettings((prev) => ({
      ...prev,
      masterVolume: clampVolume(value)
    }));
  }, []);

  const setEventEnabled = useCallback((event: ServerSoundEvent, enabled: boolean) => {
    setSettings((prev) => ({
      ...prev,
      enabledByEvent: {
        ...prev.enabledByEvent,
        [event]: enabled
      }
    }));
  }, []);

  return useMemo(() => ({
    settings,
    setMasterVolume,
    setEventEnabled,
    playServerSound
  }), [settings, setMasterVolume, setEventEnabled, playServerSound]);
}
