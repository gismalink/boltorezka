import { useMemo } from "react";
import type { InputProfile } from "../../components";

type MediaDeviceOption = { id: string; label: string };

type UseDeviceOptionLabelsArgs = {
  inputDevices: MediaDeviceOption[];
  outputDevices: MediaDeviceOption[];
  videoInputDevices: MediaDeviceOption[];
  selectedInputId: string;
  selectedInputProfile: InputProfile;
  t: (key: string) => string;
};

export function useDeviceOptionLabels({
  inputDevices,
  outputDevices,
  videoInputDevices,
  selectedInputId,
  selectedInputProfile,
  t
}: UseDeviceOptionLabelsArgs) {
  const defaultInputOption = useMemo(() => ({ id: "default", label: t("device.systemDefault") }), [t]);
  const defaultVideoOption = useMemo(() => ({ id: "default", label: t("video.systemCamera") }), [t]);

  const inputOptions = inputDevices.length > 0 ? inputDevices : [defaultInputOption];
  const outputOptions = outputDevices.length > 0 ? outputDevices : [defaultInputOption];
  const videoInputOptions = videoInputDevices.length > 0 ? videoInputDevices : [defaultVideoOption];

  const currentInputLabel = inputOptions.find((device) => device.id === selectedInputId)?.label
    ?? inputOptions[0]?.label
    ?? t("device.systemDefault");

  const inputProfileLabel = selectedInputProfile === "noise_reduction"
    ? t("settings.voiceIsolation")
    : selectedInputProfile === "studio"
      ? t("settings.studio")
      : t("settings.custom");

  const noiseSuppressionEnabled = selectedInputProfile === "noise_reduction";

  return {
    inputOptions,
    outputOptions,
    videoInputOptions,
    currentInputLabel,
    inputProfileLabel,
    noiseSuppressionEnabled
  };
}
