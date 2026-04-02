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
    setSelectedInputProfile("custom");
    setRnnoiseRuntimeStatus("inactive");
  }, [setSelectedInputProfile, setRnnoiseRuntimeStatus]);

  useEffect(() => {
    if (selectedInputProfile === "noise_reduction") {
      setSelectedInputProfile("custom");
      setRnnoiseRuntimeStatus("inactive");
      return;
    }

    setRnnoiseRuntimeStatus("inactive");
  }, [selectedInputProfile, setRnnoiseRuntimeStatus, setSelectedInputProfile]);

  return {
    handleToggleNoiseSuppression
  };
}
