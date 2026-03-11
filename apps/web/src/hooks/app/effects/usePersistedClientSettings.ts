import { useEffect } from "react";

type UsePersistedClientSettingsArgs = {
  selectedInputProfile: string;
  rnnoiseSuppressionLevel: "soft" | "medium" | "strong";
  selfMonitorEnabled: boolean;
  micMuted: boolean;
  audioMuted: boolean;
  cameraEnabled: boolean;
  serverVideoEffectType: "none" | "pixel8" | "ascii";
  serverVideoResolution: string;
  serverVideoFps: 10 | 15 | 24 | 30;
  serverVideoPixelFxStrength: number;
  serverVideoPixelFxPixelSize: number;
  serverVideoPixelFxGridThickness: number;
  serverVideoAsciiCellSize: number;
  serverVideoAsciiContrast: number;
  serverVideoAsciiColor: string;
  serverVideoWindowMinWidth: number;
  serverVideoWindowMaxWidth: number;
};

export function usePersistedClientSettings({
  selectedInputProfile,
  rnnoiseSuppressionLevel,
  selfMonitorEnabled,
  micMuted,
  audioMuted,
  cameraEnabled,
  serverVideoEffectType,
  serverVideoResolution,
  serverVideoFps,
  serverVideoPixelFxStrength,
  serverVideoPixelFxPixelSize,
  serverVideoPixelFxGridThickness,
  serverVideoAsciiCellSize,
  serverVideoAsciiContrast,
  serverVideoAsciiColor,
  serverVideoWindowMinWidth,
  serverVideoWindowMaxWidth
}: UsePersistedClientSettingsArgs) {
  useEffect(() => {
    localStorage.setItem("boltorezka_selected_input_profile", selectedInputProfile);
  }, [selectedInputProfile]);

  useEffect(() => {
    localStorage.setItem("boltorezka_rnnoise_level", rnnoiseSuppressionLevel);
  }, [rnnoiseSuppressionLevel]);

  useEffect(() => {
    localStorage.setItem("boltorezka_self_monitor", selfMonitorEnabled ? "1" : "0");
  }, [selfMonitorEnabled]);

  useEffect(() => {
    localStorage.setItem("boltorezka_audio_muted", audioMuted ? "1" : "0");
  }, [audioMuted]);

  useEffect(() => {
    localStorage.setItem("boltorezka_mic_muted", micMuted ? "1" : "0");
  }, [micMuted]);

  useEffect(() => {
    localStorage.setItem("boltorezka_camera_enabled", cameraEnabled ? "1" : "0");
  }, [cameraEnabled]);

  useEffect(() => {
    localStorage.setItem("boltorezka_server_video_effect_type", serverVideoEffectType);
    localStorage.setItem("boltorezka_server_video_fx_enabled", serverVideoEffectType === "none" ? "0" : "1");
  }, [serverVideoEffectType]);

  useEffect(() => {
    localStorage.setItem("boltorezka_server_video_resolution", serverVideoResolution);
  }, [serverVideoResolution]);

  useEffect(() => {
    localStorage.setItem("boltorezka_server_video_fps", String(serverVideoFps));
  }, [serverVideoFps]);

  useEffect(() => {
    localStorage.setItem("boltorezka_server_video_fx_strength", String(serverVideoPixelFxStrength));
  }, [serverVideoPixelFxStrength]);

  useEffect(() => {
    localStorage.setItem("boltorezka_server_video_fx_pixel_size", String(serverVideoPixelFxPixelSize));
  }, [serverVideoPixelFxPixelSize]);

  useEffect(() => {
    localStorage.setItem("boltorezka_server_video_fx_grid_thickness", String(serverVideoPixelFxGridThickness));
  }, [serverVideoPixelFxGridThickness]);

  useEffect(() => {
    localStorage.setItem("boltorezka_server_video_ascii_cell_size", String(serverVideoAsciiCellSize));
  }, [serverVideoAsciiCellSize]);

  useEffect(() => {
    localStorage.setItem("boltorezka_server_video_ascii_contrast", String(serverVideoAsciiContrast));
  }, [serverVideoAsciiContrast]);

  useEffect(() => {
    localStorage.setItem("boltorezka_server_video_ascii_color", serverVideoAsciiColor);
  }, [serverVideoAsciiColor]);

  useEffect(() => {
    localStorage.setItem("boltorezka_server_video_window_min_width", String(serverVideoWindowMinWidth));
  }, [serverVideoWindowMinWidth]);

  useEffect(() => {
    localStorage.setItem("boltorezka_server_video_window_max_width", String(serverVideoWindowMaxWidth));
  }, [serverVideoWindowMaxWidth]);
}
