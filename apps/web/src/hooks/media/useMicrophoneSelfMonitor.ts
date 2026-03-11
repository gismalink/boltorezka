import { useEffect } from "react";

type UseMicrophoneSelfMonitorArgs = {
  enabled: boolean;
  selectedInputId: string;
  micVolume: number;
  t: (key: string) => string;
  pushToast: (message: string) => void;
};

export function useMicrophoneSelfMonitor({
  enabled,
  selectedInputId,
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

    const stop = () => {
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
        const source = context.createMediaStreamSource(stream);
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
  }, [enabled, micVolume, pushToast, selectedInputId, t]);
}