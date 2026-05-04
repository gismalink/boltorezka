import { useEffect } from "react";

type UsePersistedClientSettingsArgs = {
  selectedInputProfile: string;
  rnnoiseSuppressionLevel: "none" | "soft" | "medium" | "strong";
  preRnnEchoCancellationEnabled: boolean;
  preRnnAutoGainControlEnabled: boolean;
  selfMonitorEnabled: boolean;
  walkieTalkieEnabled: boolean;
  walkieTalkieHotkey: string;
  micMuted: boolean;
  audioMuted: boolean;
  cameraEnabled: boolean;
  serverVideoEffectType: "none" | "pixel8" | "ascii";
  serverVideoResolution: string;
  serverVideoFps: 10 | 15 | 24 | 30;
  serverScreenShareResolution: "hd" | "fullhd" | "max";
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
  preRnnEchoCancellationEnabled,
  preRnnAutoGainControlEnabled,
  selfMonitorEnabled,
  walkieTalkieEnabled,
  walkieTalkieHotkey,
  micMuted,
  audioMuted,
  cameraEnabled,
  serverVideoEffectType,
  serverVideoResolution,
  serverVideoFps,
  serverScreenShareResolution,
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
    localStorage.setItem("datowave_selected_input_profile", selectedInputProfile);
  }, [selectedInputProfile]);

  useEffect(() => {
    localStorage.setItem("datowave_rnnoise_level", rnnoiseSuppressionLevel);
  }, [rnnoiseSuppressionLevel]);

  useEffect(() => {
    localStorage.setItem("datowave_pre_rnn_echo_cancellation", preRnnEchoCancellationEnabled ? "1" : "0");
  }, [preRnnEchoCancellationEnabled]);

  useEffect(() => {
    localStorage.setItem("datowave_pre_rnn_agc", preRnnAutoGainControlEnabled ? "1" : "0");
  }, [preRnnAutoGainControlEnabled]);

  useEffect(() => {
    localStorage.setItem("datowave_self_monitor", selfMonitorEnabled ? "1" : "0");
  }, [selfMonitorEnabled]);

  useEffect(() => {
    localStorage.setItem("datowave_walkie_talkie_enabled", walkieTalkieEnabled ? "1" : "0");
  }, [walkieTalkieEnabled]);

  useEffect(() => {
    localStorage.setItem("datowave_walkie_talkie_hotkey", walkieTalkieHotkey);
  }, [walkieTalkieHotkey]);

  useEffect(() => {
    localStorage.setItem("datowave_audio_muted", audioMuted ? "1" : "0");
  }, [audioMuted]);

  useEffect(() => {
    localStorage.setItem("datowave_mic_muted", micMuted ? "1" : "0");
  }, [micMuted]);

  useEffect(() => {
    localStorage.setItem("datowave_camera_enabled", cameraEnabled ? "1" : "0");
  }, [cameraEnabled]);

  useEffect(() => {
    localStorage.setItem("datowave_server_video_effect_type", serverVideoEffectType);
    localStorage.setItem("datowave_server_video_fx_enabled", serverVideoEffectType === "none" ? "0" : "1");
  }, [serverVideoEffectType]);

  useEffect(() => {
    localStorage.setItem("datowave_server_video_resolution", serverVideoResolution);
  }, [serverVideoResolution]);

  useEffect(() => {
    localStorage.setItem("datowave_server_video_fps", String(serverVideoFps));
  }, [serverVideoFps]);

  useEffect(() => {
    localStorage.setItem("datowave_server_screen_share_resolution", serverScreenShareResolution);
  }, [serverScreenShareResolution]);

  useEffect(() => {
    localStorage.setItem("datowave_server_video_fx_strength", String(serverVideoPixelFxStrength));
  }, [serverVideoPixelFxStrength]);

  useEffect(() => {
    localStorage.setItem("datowave_server_video_fx_pixel_size", String(serverVideoPixelFxPixelSize));
  }, [serverVideoPixelFxPixelSize]);

  useEffect(() => {
    localStorage.setItem("datowave_server_video_fx_grid_thickness", String(serverVideoPixelFxGridThickness));
  }, [serverVideoPixelFxGridThickness]);

  useEffect(() => {
    localStorage.setItem("datowave_server_video_ascii_cell_size", String(serverVideoAsciiCellSize));
  }, [serverVideoAsciiCellSize]);

  useEffect(() => {
    localStorage.setItem("datowave_server_video_ascii_contrast", String(serverVideoAsciiContrast));
  }, [serverVideoAsciiContrast]);

  useEffect(() => {
    localStorage.setItem("datowave_server_video_ascii_color", serverVideoAsciiColor);
  }, [serverVideoAsciiColor]);

  useEffect(() => {
    localStorage.setItem("datowave_server_video_window_min_width", String(serverVideoWindowMinWidth));
  }, [serverVideoWindowMinWidth]);

  useEffect(() => {
    localStorage.setItem("datowave_server_video_window_max_width", String(serverVideoWindowMaxWidth));
  }, [serverVideoWindowMaxWidth]);
}
