import { useEffect } from "react";
import { RnnoiseAudioProcessor, type RnnoiseSuppressionLevel } from "../rtc/rnnoiseAudioProcessor";

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
  useEffect(() => {
    if (!enabled) {
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      pushToast(t("settings.browserUnsupported"));
      return;
    }

    let disposed = false;
    let stream: MediaStream | null = null;
    let context: AudioContext | null = null;
    let processor: RnnoiseAudioProcessor | null = null;

    const stop = () => {
      if (processor) {
        void processor.destroy();
        processor = null;
      }

      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        stream = null;
      }

      if (context) {
        void context.close();
        context = null;
      }
    };

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
        if (disposed || !stream) {
          stop();
          return;
        }

        const Context = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Context) {
          throw new Error("AudioContextUnsupported");
        }

        context = new Context();
        let monitorStream = stream;
        const inputTrack = stream.getAudioTracks()[0];
        if (!inputTrack) {
          throw new Error("AudioTrackMissing");
        }

        if (selectedInputProfile === "noise_reduction") {
          try {
            const nextProcessor = new RnnoiseAudioProcessor(rnnoiseSuppressionLevel);
            await nextProcessor.init({
              track: inputTrack,
              audioContext: context
            });

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

        const source = context.createMediaStreamSource(monitorStream);
        const gain = context.createGain();
        gain.gain.value = Math.max(0, Math.min(0.7, (micVolume / 100) * 0.7));
        source.connect(gain);
        gain.connect(context.destination);
      } catch (error) {
        if (disposed) {
          return;
        }

        const errorName = (error as { name?: string; message?: string })?.name
          || (error as { message?: string })?.message
          || "";
        const denied = errorName === "NotAllowedError" || errorName === "SecurityError";
        pushToast(denied ? t("settings.mediaDenied") : t("settings.devicesLoadFailed"));
        stop();
      }
    };

    void start();

    return () => {
      disposed = true;
      stop();
    };
  }, [enabled, micVolume, pushToast, rnnoiseSuppressionLevel, selectedInputId, selectedInputProfile, t]);
}