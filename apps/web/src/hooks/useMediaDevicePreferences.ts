import { useCallback, useEffect, useRef } from "react";
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

const FALLBACK_DEVICE_ID = "default";

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
  const permissionPromptTriedRef = useRef(false);

  const requestMicPermission = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      stream.getTracks().forEach((track) => track.stop());
      return true;
    } catch (error) {
      const errorName = (error as { name?: string })?.name || "";
      if (errorName === "NotAllowedError" || errorName === "SecurityError") {
        setMediaDevicesState("denied");
        setMediaDevicesHint(t("settings.mediaDenied"));
      }
      return false;
    }
  }, [setMediaDevicesState, setMediaDevicesHint, t]);

  const loadDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setMediaDevicesState("unsupported");
      setMediaDevicesHint(t("settings.browserUnsupported"));
      return;
    }

    const enumerateWithRetry = async () => {
      try {
        return await navigator.mediaDevices.enumerateDevices();
      } catch {
        await new Promise((resolve) => window.setTimeout(resolve, 350));
        return navigator.mediaDevices.enumerateDevices();
      }
    };

    try {
      const devices = await enumerateWithRetry();
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

      const hasNoAudioDevices = inputs.length === 0 && outputs.length === 0;
      if (hasNoAudioDevices && !permissionPromptTriedRef.current) {
        permissionPromptTriedRef.current = true;
        const permissionGranted = await requestMicPermission();
        if (permissionGranted) {
          const devicesAfterPermission = await enumerateWithRetry();
          const refreshedInputs = devicesAfterPermission
            .filter((item) => item.kind === "audioinput")
            .map((item, index) => ({
              id: item.deviceId || `input-${index}`,
              label: item.label || `${t("settings.microphone")} ${index + 1}`
            }));
          const refreshedOutputs = devicesAfterPermission
            .filter((item) => item.kind === "audiooutput")
            .map((item, index) => ({
              id: item.deviceId || `output-${index}`,
              label: item.label || `${t("settings.outputDevice")} ${index + 1}`
            }));

          setInputDevices(refreshedInputs.length > 0 ? refreshedInputs : [{ id: FALLBACK_DEVICE_ID, label: t("device.systemDefault") }]);
          setOutputDevices(refreshedOutputs.length > 0 ? refreshedOutputs : [{ id: FALLBACK_DEVICE_ID, label: t("device.systemDefault") }]);

          if (refreshedInputs.length > 0 && !refreshedInputs.some((item) => item.id === selectedInputId)) {
            setSelectedInputId(refreshedInputs[0].id);
          }
          if (refreshedOutputs.length > 0 && !refreshedOutputs.some((item) => item.id === selectedOutputId)) {
            setSelectedOutputId(refreshedOutputs[0].id);
          }

          setMediaDevicesState("ready");
          setMediaDevicesHint("");
          return;
        }
      }

      if (hasNoAudioDevices) {
        setInputDevices([{ id: FALLBACK_DEVICE_ID, label: t("device.systemDefault") }]);
        setOutputDevices([{ id: FALLBACK_DEVICE_ID, label: t("device.systemDefault") }]);
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

      setInputDevices([{ id: FALLBACK_DEVICE_ID, label: t("device.systemDefault") }]);
      setOutputDevices([{ id: FALLBACK_DEVICE_ID, label: t("device.systemDefault") }]);
      if (selectedInputId !== FALLBACK_DEVICE_ID) {
        setSelectedInputId(FALLBACK_DEVICE_ID);
      }
      if (selectedOutputId !== FALLBACK_DEVICE_ID) {
        setSelectedOutputId(FALLBACK_DEVICE_ID);
      }
      setMediaDevicesState("ready");
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
    setSelectedOutputId,
    requestMicPermission
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
