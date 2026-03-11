import { useEffect, useRef } from "react";
import { RnnoiseAudioProcessor, type RnnoiseSuppressionLevel } from "../rtc/rnnoiseAudioProcessor";
import { getSelfMonitorGain, shouldUseRnnoiseInSelfMonitor } from "./selfMonitorUtils";

type UseMicrophoneSelfMonitorArgs = {
  enabled: boolean;
  selectedInputId: string;
  selectedInputProfile: "noise_reduction" | "studio" | "custom";
  rnnoiseSuppressionLevel: RnnoiseSuppressionLevel;
  micVolume: number;
  t: (key: string) => string;
  pushToast: (message: string) => void;
};

export function useMicrophoneSelfMonitor({
  enabled,
  selectedInputId,
  selectedInputProfile,
  rnnoiseSuppressionLevel,
  micVolume,
  t,
  pushToast
}: UseMicrophoneSelfMonitorArgs) {
  const sessionRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      pushToast(t("settings.browserUnsupported"));
      return;
    }

    let disposed = false;
    const sessionId = ++sessionRef.current;
    let stream: MediaStream | null = null;
    let context: AudioContext | null = null;
    let processor: RnnoiseAudioProcessor | null = null;
    let sourceNode: MediaStreamAudioSourceNode | null = null;
    let gainNode: GainNode | null = null;

    const stop = async () => {
      sourceNode?.disconnect();
      sourceNode = null;

      gainNode?.disconnect();
      gainNode = null;

      if (processor) {
        await processor.destroy().catch(() => undefined);
        processor = null;
      }

      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        stream = null;
      }

      if (context) {
        await context.close().catch(() => undefined);
        context = null;
      }
    };

    const isCurrentSession = () => !disposed && sessionRef.current === sessionId;

    const start = async () => {
      try {
        const getStream = async () => {
          if (selectedInputId && selectedInputId !== "default") {
            try {
              return await navigator.mediaDevices.getUserMedia({
                audio: { deviceId: { exact: selectedInputId } },
                video: false
              });
            } catch (error) {
              const errorName = (error as { name?: string })?.name || "";
              if (errorName !== "NotFoundError" && errorName !== "OverconstrainedError") {
                throw error;
              }
            }
          }

          return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        };

        stream = await getStream();
        if (!stream || !isCurrentSession()) {
          await stop();
          return;
        }

        const Context = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Context) {
          throw new Error("AudioContextUnsupported");
        }

        context = new Context();
        if (!isCurrentSession()) {
          await stop();
          return;
        }

        let monitorStream = stream;
        const inputTrack = stream.getAudioTracks()[0];
        if (!inputTrack) {
          throw new Error("AudioTrackMissing");
        }

        if (shouldUseRnnoiseInSelfMonitor(selectedInputProfile)) {
          try {
            const nextProcessor = new RnnoiseAudioProcessor(rnnoiseSuppressionLevel);
            await nextProcessor.init({
              track: inputTrack,
              audioContext: context
            });

            if (!isCurrentSession()) {
              await nextProcessor.destroy().catch(() => undefined);
              await stop();
              return;
            }

            if (nextProcessor.processedTrack) {
              processor = nextProcessor;
              monitorStream = new MediaStream([nextProcessor.processedTrack]);
            } else {
              void nextProcessor.destroy();
            }
          } catch {
            pushToast(t("settings.rnnFallbackError"));
          }
        }

        if (!isCurrentSession()) {
          await stop();
          return;
        }

        sourceNode = context.createMediaStreamSource(monitorStream);
        gainNode = context.createGain();
        gainNode.gain.value = getSelfMonitorGain(micVolume);
        sourceNode.connect(gainNode);
        gainNode.connect(context.destination);
      } catch (error) {
        if (!isCurrentSession()) {
          return;
        }

        const errorName = (error as { name?: string; message?: string })?.name
          || (error as { message?: string })?.message
          || "";
        const denied = errorName === "NotAllowedError" || errorName === "SecurityError";
        pushToast(denied ? t("settings.mediaDenied") : t("settings.devicesLoadFailed"));
        await stop();
      }
    };

    void start();

    return () => {
      disposed = true;
      void stop();
    };
  }, [enabled, micVolume, pushToast, rnnoiseSuppressionLevel, selectedInputId, selectedInputProfile, t]);
}