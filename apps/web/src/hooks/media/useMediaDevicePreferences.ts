import { useCallback, useEffect, useRef } from "react";
import type { MediaDevicesState } from "../../components";
import { asTrimmedString } from "../../utils/stringUtils";

type DeviceOption = { id: string; label: string };

type UseMediaDevicePreferencesArgs = {
  t: (key: string) => string;
  selectedInputId: string;
  selectedOutputId: string;
  selectedVideoInputId: string;
  micVolume: number;
  outputVolume: number;
  setInputDevices: (value: DeviceOption[]) => void;
  setOutputDevices: (value: DeviceOption[]) => void;
  setVideoInputDevices: (value: DeviceOption[]) => void;
  setMediaDevicesState: (value: MediaDevicesState) => void;
  setMediaDevicesHint: (value: string) => void;
  setSelectedInputId: (value: string) => void;
  setSelectedOutputId: (value: string) => void;
  setSelectedVideoInputId: (value: string) => void;
};

const FALLBACK_DEVICE_ID = "default";

const OUTPUT_PREF_KEY = "datowave_selected_output_id";
const VIDEO_INPUT_PREF_KEY = "datowave_selected_video_input_id";

const EARPICE_OUTPUT_RE = /(earpiece|receiver|handset|phone|при[её]мник|телефон|communications?)/i;
const SPEAKER_OUTPUT_RE = /(speaker|loud|громк|динамик)/i;

function isMobileChromeBrowser(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }

  const ua = navigator.userAgent || "";
  const hasChrome = /Chrome\//i.test(ua) || /CriOS\//i.test(ua);
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const isEdgeOrOpera = /EdgA\//i.test(ua) || /OPR\//i.test(ua);

  return hasChrome && isMobile && !isEdgeOrOpera;
}

function pickPreferredMobileOutput(outputs: DeviceOption[]): string | null {
  if (outputs.length === 0) {
    return null;
  }

  const strongMatch = outputs.find((item) => EARPICE_OUTPUT_RE.test(item.label) || EARPICE_OUTPUT_RE.test(item.id));
  if (strongMatch) {
    return strongMatch.id;
  }

  const nonSpeaker = outputs.find((item) => !SPEAKER_OUTPUT_RE.test(item.label));
  if (nonSpeaker) {
    return nonSpeaker.id;
  }

  return null;
}

function buildDeviceOptions(
  devices: MediaDeviceInfo[],
  kind: MediaDeviceKind,
  fallbackLabel: string,
  prefix: string
): DeviceOption[] {
  const filtered = devices.filter((item) => {
    if (item.kind !== kind) {
      return false;
    }

    const id = asTrimmedString(item.deviceId);
    if (!id) {
      return false;
    }

    // Virtual routing aliases are confusing in selector UI and duplicate real devices.
    if (id === "default" || id === "communications") {
      return false;
    }

    return true;
  });

  const uniqueById = new Map<string, DeviceOption>();
  filtered.forEach((item, index) => {
    const id = asTrimmedString(item.deviceId);
    if (!id || uniqueById.has(id)) {
      return;
    }

    uniqueById.set(id, {
      id,
      label: asTrimmedString(item.label) || `${fallbackLabel} ${index + 1}`
    });
  });

  const options = Array.from(uniqueById.values());
  if (options.length > 0) {
    return options;
  }

  return [{ id: FALLBACK_DEVICE_ID, label: prefix }];
}

function resolveMissingDeviceSelection(currentSelectedId: string, options: DeviceOption[]): string {
  if (options.some((item) => item.id === currentSelectedId)) {
    return currentSelectedId;
  }

  // Prefer browser/system routing defaults when current physical device disappears.
  return FALLBACK_DEVICE_ID;
}

export function useMediaDevicePreferences({
  t,
  selectedInputId,
  selectedOutputId,
  selectedVideoInputId,
  micVolume,
  outputVolume,
  setInputDevices,
  setOutputDevices,
  setVideoInputDevices,
  setMediaDevicesState,
  setMediaDevicesHint,
  setSelectedInputId,
  setSelectedOutputId,
  setSelectedVideoInputId
}: UseMediaDevicePreferencesArgs) {
  const permissionPromptTriedRef = useRef(false);
  const mobileOutputDefaultAppliedRef = useRef(false);

  const applyDeniedState = useCallback(() => {
    setInputDevices([{ id: FALLBACK_DEVICE_ID, label: t("device.systemDefault") }]);
    setOutputDevices([{ id: FALLBACK_DEVICE_ID, label: t("device.systemDefault") }]);
    setVideoInputDevices([{ id: FALLBACK_DEVICE_ID, label: t("video.systemCamera") }]);
    if (selectedInputId !== FALLBACK_DEVICE_ID) {
      setSelectedInputId(FALLBACK_DEVICE_ID);
    }
    if (selectedOutputId !== FALLBACK_DEVICE_ID) {
      setSelectedOutputId(FALLBACK_DEVICE_ID);
    }
    if (selectedVideoInputId !== FALLBACK_DEVICE_ID) {
      setSelectedVideoInputId(FALLBACK_DEVICE_ID);
    }
    setMediaDevicesState("denied");
    setMediaDevicesHint(t("settings.mediaDenied"));
  }, [
    selectedInputId,
    selectedOutputId,
    selectedVideoInputId,
    setInputDevices,
    setOutputDevices,
    setVideoInputDevices,
    setMediaDevicesState,
    setMediaDevicesHint,
    setSelectedInputId,
    setSelectedOutputId,
    setSelectedVideoInputId,
    t
  ]);

  const getMicrophonePermissionState = useCallback(async (): Promise<PermissionState | null> => {
    const permissionsApi = (navigator as Navigator & {
      permissions?: { query: (descriptor: { name: PermissionName }) => Promise<PermissionStatus> };
    }).permissions;

    if (!permissionsApi?.query) {
      return null;
    }

    try {
      const status = await permissionsApi.query({ name: "microphone" as PermissionName });
      return status.state;
    } catch {
      return null;
    }
  }, []);

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
        applyDeniedState();
      }
      return false;
    }
  }, [applyDeniedState]);

  const requestVideoPermission = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
      stream.getTracks().forEach((track) => track.stop());
      return true;
    } catch {
      return false;
    }
  }, []);

  const loadDevices = useCallback(async () => {
    const permissionState = await getMicrophonePermissionState();
    if (permissionState === "denied") {
      applyDeniedState();
      return;
    }

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
      const rawInputs = devices.filter((item) => item.kind === "audioinput");
      const rawOutputs = devices.filter((item) => item.kind === "audiooutput");
      const inputs = buildDeviceOptions(devices, "audioinput", t("settings.microphone"), t("device.systemDefault"));
      const outputs = buildDeviceOptions(devices, "audiooutput", t("settings.outputDevice"), t("device.systemDefault"));
      const videoInputs = buildDeviceOptions(devices, "videoinput", t("video.cameraDevice"), t("video.systemCamera"));

      setInputDevices(inputs);
      setOutputDevices(outputs);
      setVideoInputDevices(videoInputs);

      if (!mobileOutputDefaultAppliedRef.current && isMobileChromeBrowser()) {
        mobileOutputDefaultAppliedRef.current = true;
        const hasSavedOutputPreference = localStorage.getItem(OUTPUT_PREF_KEY) !== null;
        const isUsingDefaultRoute = selectedOutputId === FALLBACK_DEVICE_ID;
        if (!hasSavedOutputPreference && isUsingDefaultRoute) {
          const preferredOutputId = pickPreferredMobileOutput(outputs);
          if (preferredOutputId && preferredOutputId !== selectedOutputId) {
            setSelectedOutputId(preferredOutputId);
          }
        }
      }

      const hasNoAudioDevices = rawInputs.length === 0 && rawOutputs.length === 0;
      const inputLabelsHidden = rawInputs.length > 0 && rawInputs.every((item) => !asTrimmedString(item.label));
      const outputLabelsHidden = rawOutputs.length > 0 && rawOutputs.every((item) => !asTrimmedString(item.label));
      const shouldRetryAfterPermission = hasNoAudioDevices || inputLabelsHidden || outputLabelsHidden;

      if (shouldRetryAfterPermission && !permissionPromptTriedRef.current) {
        permissionPromptTriedRef.current = true;
        const permissionGranted = await requestMicPermission();
        if (permissionGranted) {
          const devicesAfterPermission = await enumerateWithRetry();
          const refreshedInputs = buildDeviceOptions(devicesAfterPermission, "audioinput", t("settings.microphone"), t("device.systemDefault"));
          const refreshedOutputs = buildDeviceOptions(devicesAfterPermission, "audiooutput", t("settings.outputDevice"), t("device.systemDefault"));
          const refreshedVideoInputs = buildDeviceOptions(devicesAfterPermission, "videoinput", t("video.cameraDevice"), t("video.systemCamera"));

          setInputDevices(refreshedInputs);
          setOutputDevices(refreshedOutputs);
          setVideoInputDevices(refreshedVideoInputs);

          const refreshedRawInputs = devicesAfterPermission.filter((item) => item.kind === "audioinput");
          const refreshedRawOutputs = devicesAfterPermission.filter((item) => item.kind === "audiooutput");

          const nextInputId = resolveMissingDeviceSelection(selectedInputId, refreshedInputs);
          if (nextInputId !== selectedInputId) {
            setSelectedInputId(nextInputId);
          }

          const nextOutputId = resolveMissingDeviceSelection(selectedOutputId, refreshedOutputs);
          if (nextOutputId !== selectedOutputId) {
            setSelectedOutputId(nextOutputId);
          }

          const nextVideoInputId = resolveMissingDeviceSelection(selectedVideoInputId, refreshedVideoInputs);
          if (nextVideoInputId !== selectedVideoInputId) {
            setSelectedVideoInputId(nextVideoInputId);
          }

          setMediaDevicesState("ready");
          setMediaDevicesHint("");
          return;
        }

        if (inputLabelsHidden || outputLabelsHidden) {
          applyDeniedState();
          return;
        }
      }

      if (permissionPromptTriedRef.current && (inputLabelsHidden || outputLabelsHidden)) {
        const latestPermissionState = await getMicrophonePermissionState();
        if (latestPermissionState === "denied" || latestPermissionState === null) {
          applyDeniedState();
          return;
        }
      }

      if (hasNoAudioDevices) {
        setInputDevices([{ id: FALLBACK_DEVICE_ID, label: t("device.systemDefault") }]);
        setOutputDevices([{ id: FALLBACK_DEVICE_ID, label: t("device.systemDefault") }]);
        setVideoInputDevices([{ id: FALLBACK_DEVICE_ID, label: t("video.systemCamera") }]);
        setMediaDevicesState("error");
        setMediaDevicesHint(t("settings.devicesNotFound"));
      } else {
        setMediaDevicesState("ready");
        setMediaDevicesHint("");
      }

      const nextInputId = resolveMissingDeviceSelection(selectedInputId, inputs);
      if (nextInputId !== selectedInputId) {
        setSelectedInputId(nextInputId);
      }

      const nextOutputId = resolveMissingDeviceSelection(selectedOutputId, outputs);
      if (nextOutputId !== selectedOutputId) {
        setSelectedOutputId(nextOutputId);
      }

      const nextVideoInputId = resolveMissingDeviceSelection(selectedVideoInputId, videoInputs);
      if (nextVideoInputId !== selectedVideoInputId) {
        setSelectedVideoInputId(nextVideoInputId);
      }
    } catch (error) {
      const errorName = (error as { name?: string })?.name || "";
      if (errorName === "NotAllowedError" || errorName === "SecurityError") {
        applyDeniedState();
        return;
      }

      setInputDevices([{ id: FALLBACK_DEVICE_ID, label: t("device.systemDefault") }]);
      setOutputDevices([{ id: FALLBACK_DEVICE_ID, label: t("device.systemDefault") }]);
      setVideoInputDevices([{ id: FALLBACK_DEVICE_ID, label: t("video.systemCamera") }]);
      if (selectedInputId !== FALLBACK_DEVICE_ID) {
        setSelectedInputId(FALLBACK_DEVICE_ID);
      }
      if (selectedOutputId !== FALLBACK_DEVICE_ID) {
        setSelectedOutputId(FALLBACK_DEVICE_ID);
      }
      if (selectedVideoInputId !== FALLBACK_DEVICE_ID) {
        setSelectedVideoInputId(FALLBACK_DEVICE_ID);
      }
      setMediaDevicesState("error");
      setMediaDevicesHint(t("settings.devicesLoadFailed"));
    }
  }, [
    selectedInputId,
    selectedOutputId,
    selectedVideoInputId,
    t,
    setInputDevices,
    setOutputDevices,
    setVideoInputDevices,
    setMediaDevicesState,
    setMediaDevicesHint,
    setSelectedInputId,
    setSelectedOutputId,
    setSelectedVideoInputId,
    requestMicPermission,
    getMicrophonePermissionState,
    applyDeniedState
  ]);

  useEffect(() => {
    localStorage.setItem("datowave_mic_volume", String(micVolume));
  }, [micVolume]);

  useEffect(() => {
    localStorage.setItem("datowave_output_volume", String(outputVolume));
  }, [outputVolume]);

  useEffect(() => {
    localStorage.setItem("datowave_selected_input_id", selectedInputId);
  }, [selectedInputId]);

  useEffect(() => {
    localStorage.setItem(OUTPUT_PREF_KEY, selectedOutputId);
  }, [selectedOutputId]);

  useEffect(() => {
    localStorage.setItem(VIDEO_INPUT_PREF_KEY, selectedVideoInputId);
  }, [selectedVideoInputId]);

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
    refreshDevices: (forcePrompt = false) => {
      if (forcePrompt) {
        void requestMicPermission().finally(() => {
          void loadDevices();
        });
        return;
      }

      void loadDevices();
    },
    requestMediaAccess: () => {
      void requestMicPermission().finally(() => {
        void loadDevices();
      });
    },
    requestVideoAccess: () => {
      void requestVideoPermission().finally(() => {
        void loadDevices();
      });
    }
  };
}
