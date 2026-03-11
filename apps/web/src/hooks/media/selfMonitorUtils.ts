export const getSelfMonitorGain = (micVolume: number): number => {
  return Math.max(0, Math.min(0.7, (Number(micVolume) / 100) * 0.7));
};

export const shouldUseRnnoiseInSelfMonitor = (selectedInputProfile: "noise_reduction" | "studio" | "custom"): boolean => {
  return selectedInputProfile === "noise_reduction";
};
