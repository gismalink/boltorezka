import { useEffect } from "react";
import type { MutableRefObject } from "react";
import { logVoiceDiagnostics } from "../utils/voiceDiagnostics";
import type { VoicePeersRef } from "./voiceCallTypes";

type UseVoiceRuntimeMediaEffectsArgs = {
  localStreamRef: MutableRefObject<MediaStream | null>;
  peersRef: VoicePeersRef;
  selectedInputId: string;
  micMuted: boolean;
  audioMuted: boolean;
  outputVolume: number;
  getAudioConstraints: () => MediaTrackConstraints | boolean;
  applyRemoteAudioOutput: (element: HTMLAudioElement) => Promise<void>;
  retryRemoteAudioPlayback: (reason: string) => void;
  pushCallLog: (text: string) => void;
  pushToastThrottled: (key: string, message: string) => void;
  t: (key: string) => string;
};

export function useVoiceRuntimeMediaEffects({
  localStreamRef,
  peersRef,
  selectedInputId,
  micMuted,
  audioMuted,
  outputVolume,
  getAudioConstraints,
  applyRemoteAudioOutput,
  retryRemoteAudioPlayback,
  pushCallLog,
  pushToastThrottled,
  t
}: UseVoiceRuntimeMediaEffectsArgs) {
  useEffect(() => {
    if (!localStreamRef.current) {
      return;
    }

    localStreamRef.current.getAudioTracks().forEach((track) => {
      track.enabled = !micMuted;
    });
  }, [localStreamRef, micMuted]);

  useEffect(() => {
    peersRef.current.forEach((peer) => {
      void applyRemoteAudioOutput(peer.audioElement);
    });
  }, [peersRef, applyRemoteAudioOutput]);

  useEffect(() => {
    const gainValue = audioMuted ? 0 : Math.max(0, Math.min(1, outputVolume / 100));
    peersRef.current.forEach((peer) => {
      if (peer.speakingGain) {
        peer.speakingGain.gain.value = gainValue;
      }
      if (!audioMuted && peer.speakingAudioContext?.state === "suspended") {
        void peer.speakingAudioContext.resume().catch(() => {
          return;
        });
      }
    });
  }, [peersRef, audioMuted, outputVolume]);

  useEffect(() => {
    const handleUserGesture = () => {
      retryRemoteAudioPlayback("user-gesture");
    };

    window.addEventListener("pointerdown", handleUserGesture, { passive: true });
    window.addEventListener("touchstart", handleUserGesture, { passive: true });
    window.addEventListener("keydown", handleUserGesture);

    return () => {
      window.removeEventListener("pointerdown", handleUserGesture);
      window.removeEventListener("touchstart", handleUserGesture);
      window.removeEventListener("keydown", handleUserGesture);
    };
  }, [retryRemoteAudioPlayback]);

  useEffect(() => {
    const connections = Array.from(peersRef.current.values()).map((item) => item.connection);
    if (connections.length === 0 || !localStreamRef.current) {
      return;
    }

    let cancelled = false;

    const replaceAudioTrack = async () => {
      try {
        const nextStream = await navigator.mediaDevices.getUserMedia({
          audio: getAudioConstraints(),
          video: false
        });

        if (cancelled) {
          nextStream.getTracks().forEach((track) => track.stop());
          return;
        }

        const nextTrack = nextStream.getAudioTracks()[0];
        if (!nextTrack) {
          nextStream.getTracks().forEach((track) => track.stop());
          return;
        }

        nextTrack.enabled = !micMuted;

        await Promise.all(
          connections.map(async (connection) => {
            const sender = connection.getSenders().find((item) => item.track?.kind === "audio");
            if (sender) {
              await sender.replaceTrack(nextTrack);
            }
          })
        );

        localStreamRef.current?.getTracks().forEach((track) => track.stop());
        localStreamRef.current = nextStream;
        pushCallLog("input device switched for active call");
        logVoiceDiagnostics("runtime input track replaced", {
          selectedInputId: selectedInputId || "default"
        });
      } catch (error) {
        if (!cancelled) {
          pushToastThrottled("devices-load-failed", t("settings.devicesLoadFailed"));
          pushCallLog(`input device switch failed: ${(error as Error).message}`);
        }
      }
    };

    void replaceAudioTrack();

    return () => {
      cancelled = true;
    };
  }, [peersRef, localStreamRef, selectedInputId, getAudioConstraints, micMuted, t, pushToastThrottled, pushCallLog]);
}
