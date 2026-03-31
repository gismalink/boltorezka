import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { InputProfile } from "../../components";

type UseRnnoiseRuntimeHandlersArgs = {
  selectedInputProfile: InputProfile;
  setSelectedInputProfile: Dispatch<SetStateAction<InputProfile>>;
  setRnnoiseRuntimeStatus: Dispatch<SetStateAction<"inactive" | "active" | "unavailable" | "error">>;
  pushToast: (message: string) => void;
  t: (key: string) => string;
};

export function useRnnoiseRuntimeHandlers({
  selectedInputProfile,
  setSelectedInputProfile,
  setRnnoiseRuntimeStatus,
  pushToast,
  t
}: UseRnnoiseRuntimeHandlersArgs) {
  const handleRnnoiseStatusChange = useCallback((status: "inactive" | "active" | "unavailable" | "error") => {
    setRnnoiseRuntimeStatus(selectedInputProfile === "noise_reduction" ? status : "inactive");
  }, [selectedInputProfile, setRnnoiseRuntimeStatus]);

  const handleRnnoiseFallback = useCallback((reason: "unavailable" | "error") => {
    if (selectedInputProfile !== "noise_reduction") {
      return;
    }

    setSelectedInputProfile("custom");
    setRnnoiseRuntimeStatus("inactive");
    if (reason === "unavailable") {
      pushToast(t("settings.rnnFallbackUnavailable"));
    } else {
      pushToast(t("settings.rnnFallbackError"));
    }
  }, [pushToast, selectedInputProfile, setRnnoiseRuntimeStatus, setSelectedInputProfile, t]);

  return {
    handleRnnoiseStatusChange,
    handleRnnoiseFallback
  };
}