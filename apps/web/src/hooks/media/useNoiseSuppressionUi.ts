import { useCallback, useEffect, type Dispatch, type SetStateAction } from "react";
import type { InputProfile } from "../../components";

type UseNoiseSuppressionUiArgs = {
  selectedInputProfile: InputProfile;
  setSelectedInputProfile: Dispatch<SetStateAction<InputProfile>>;
  setRnnoiseRuntimeStatus: Dispatch<SetStateAction<"inactive" | "active" | "unavailable" | "error">>;
};

export function useNoiseSuppressionUi({
  selectedInputProfile,
  setSelectedInputProfile,
  setRnnoiseRuntimeStatus
}: UseNoiseSuppressionUiArgs) {
  const handleToggleNoiseSuppression = useCallback(() => {
    setSelectedInputProfile((current) => {
      const next = current === "noise_reduction" ? "custom" : "noise_reduction";
      if (next !== "noise_reduction") {
        setRnnoiseRuntimeStatus("inactive");
      }
      return next;
    });
  }, [setSelectedInputProfile, setRnnoiseRuntimeStatus]);

  useEffect(() => {
    if (selectedInputProfile !== "noise_reduction") {
      setRnnoiseRuntimeStatus("inactive");
    }
  }, [selectedInputProfile, setRnnoiseRuntimeStatus]);

  return {
    handleToggleNoiseSuppression
  };
}
