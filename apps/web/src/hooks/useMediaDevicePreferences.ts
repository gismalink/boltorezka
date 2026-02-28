import { useCallback, useEffect } from "react";
import type { MediaDevicesState } from "../components";

type DeviceOption = { id: string; label: string };

type UseMediaDevicePreferencesArgs = {
  t: (key: string) => string;
  selectedInputId: string;
  selectedOutputId: string;
  micVolume: number;
  outputVolume: number;
  setInputDevices: (value: DeviceOption[]) => void;
  setOutputDevices: (value: DeviceOption[]) => void;
  setMediaDevicesState: (value: MediaDevicesState) => void;
  setMediaDevicesHint: (value: string) => void;
  setSelectedInputId: (value: string) => void;
  setSelectedOutputId: (value: string) => void;
};

export function useMediaDevicePreferences({
  t,
  selectedInputId,
  selectedOutputId,
  micVolume,
  outputVolume,
  setInputDevices,
  setOutputDevices,
  setMediaDevicesState,
  setMediaDevicesHint,
  setSelectedInputId,
  setSelectedOutputId
}: UseMediaDevicePreferencesArgs) {
  const loadDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setMediaDevicesState("unsupported");
      setMediaDevicesHint(t("settings.browserUnsupported"));
      return;
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices
        .filter((item) => item.kind === "audioinput")
        .map((item, index) => ({
          id: item.deviceId || `input-${index}`,
          label: item.label || `${t("settings.microphone")} ${index + 1}`
        }));
      const outputs = devices
        .filter((item) => item.kind === "audiooutput")
        .map((item, index) => ({
          id: item.deviceId || `output-${index}`,
          label: item.label || `${t("settings.outputDevice")} ${index + 1}`
        }));

      setInputDevices(inputs);
      setOutputDevices(outputs);

      if (inputs.length === 0 && outputs.length === 0) {
        setMediaDevicesState("error");
        setMediaDevicesHint(t("settings.devicesNotFound"));
      } else {
        setMediaDevicesState("ready");
        setMediaDevicesHint("");
      }

      if (inputs.length > 0 && !inputs.some((item) => item.id === selectedInputId)) {
        setSelectedInputId(inputs[0].id);
      }
      if (outputs.length > 0 && !outputs.some((item) => item.id === selectedOutputId)) {
        setSelectedOutputId(outputs[0].id);
      }
    } catch (error) {
      const errorName = (error as { name?: string })?.name || "";
      if (errorName === "NotAllowedError" || errorName === "SecurityError") {
        setMediaDevicesState("denied");
        setMediaDevicesHint(t("settings.mediaDenied"));
        return;
      }

      setMediaDevicesState("error");
      setMediaDevicesHint(t("settings.devicesLoadFailed"));
    }
  }, [
    selectedInputId,
    selectedOutputId,
    t,
    setInputDevices,
    setOutputDevices,
    setMediaDevicesState,
    setMediaDevicesHint,
    setSelectedInputId,
    setSelectedOutputId
  ]);

  useEffect(() => {
    localStorage.setItem("boltorezka_mic_volume", String(micVolume));
  }, [micVolume]);

  useEffect(() => {
    localStorage.setItem("boltorezka_output_volume", String(outputVolume));
  }, [outputVolume]);

  useEffect(() => {
    localStorage.setItem("boltorezka_selected_input_id", selectedInputId);
  }, [selectedInputId]);

  useEffect(() => {
    localStorage.setItem("boltorezka_selected_output_id", selectedOutputId);
  }, [selectedOutputId]);

  useEffect(() => {
    void loadDevices();

    if (!navigator.mediaDevices?.addEventListener) {
      return;
    }

    const handleDeviceChange = () => {
      void loadDevices();
    };

    navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);
    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", handleDeviceChange);
    };
  }, [loadDevices]);

  return {
    refreshDevices: () => {
      void loadDevices();
    }
  };
}
