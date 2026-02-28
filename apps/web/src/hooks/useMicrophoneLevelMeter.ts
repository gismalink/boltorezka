import { useEffect } from "react";

type UseMicrophoneLevelMeterArgs = {
  running: boolean;
  selectedInputId: string;
  t: (key: string) => string;
  pushToast: (message: string) => void;
  setRunning: (value: boolean) => void;
  setLevel: (value: number) => void;
};

const LEVEL_MULTIPLIER = 3.2;

export function useMicrophoneLevelMeter({
  running,
  selectedInputId,
  t,
  pushToast,
  setRunning,
  setLevel
}: UseMicrophoneLevelMeterArgs) {
  useEffect(() => {
    if (!running) {
      setLevel(0);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setRunning(false);
      setLevel(0);
      pushToast(t("settings.browserUnsupported"));
      return;
    }

    let disposed = false;
    let animationFrameId = 0;
    let stream: MediaStream | null = null;
    let audioContext: AudioContext | null = null;
    let smoothedLevel = 0;

    const stop = () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = 0;
      }

      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        stream = null;
      }

      if (audioContext) {
        void audioContext.close();
        audioContext = null;
      }

      setLevel(0);
    };

    const start = async () => {
      try {
        const getStream = async () => {
          if (selectedInputId && selectedInputId !== "default") {
            try {
              return await navigator.mediaDevices.getUserMedia({
                audio: { deviceId: { exact: selectedInputId } }
              });
            } catch (error) {
              const errorName = (error as { name?: string; message?: string })?.name || "";
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

        audioContext = new Context();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.84;
        source.connect(analyser);

        const data = new Uint8Array(analyser.fftSize);

        const tick = () => {
          if (disposed) {
            return;
          }

          analyser.getByteTimeDomainData(data);

          let sum = 0;
          for (let index = 0; index < data.length; index += 1) {
            const normalized = (data[index] - 128) / 128;
            sum += normalized * normalized;
          }

          const rms = Math.sqrt(sum / data.length);
          const level = Math.min(1, rms * LEVEL_MULTIPLIER);
          smoothedLevel = smoothedLevel * 0.78 + level * 0.22;
          setLevel(smoothedLevel);

          animationFrameId = requestAnimationFrame(tick);
        };

        tick();
      } catch (error) {
        if (disposed) {
          return;
        }

        const errorName = (error as { name?: string; message?: string })?.name || (error as { message?: string })?.message || "";
        const denied = errorName === "NotAllowedError" || errorName === "SecurityError";

        setRunning(false);
        setLevel(0);
        pushToast(denied ? t("settings.mediaDenied") : t("settings.devicesLoadFailed"));
      }
    };

    void start();

    return () => {
      disposed = true;
      stop();
    };
  }, [running, selectedInputId, t, pushToast, setRunning, setLevel]);
}
