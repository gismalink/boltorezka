import { useState } from "react";
import { DEFAULT_CHAT_IMAGE_DATA_URL_LENGTH, DEFAULT_CHAT_IMAGE_MAX_SIDE, DEFAULT_CHAT_IMAGE_QUALITY, DEFAULT_MIC_VOLUME, DEFAULT_OUTPUT_VOLUME } from "../../../constants/appConfig";
import type { InputProfile, MediaDevicesState } from "../../../components";
import type { AudioQuality, UiTheme } from "../../../domain";
import { detectInitialLang, type Lang } from "../../../i18n";
import type { RnnoiseSuppressionLevel } from "../../rtc/rnnoiseAudioProcessor";
import type { ServerScreenShareResolution, ServerVideoEffectType, ServerVideoResolution } from "../../rtc/voiceCallTypes";
import { normalizeUiTheme, readNonZeroDefaultVolume } from "../../../utils/appShell";
import { DEFAULT_PUSH_TO_TALK_HOTKEY, normalizePushToTalkHotkey } from "../../../utils/pushToTalk";
import { asTrimmedString } from "../../../utils/stringUtils";

export function useAppUserMediaState() {
  const [micMuted, setMicMuted] = useState<boolean>(() => localStorage.getItem("boltorezka_mic_muted") !== "0");
  const [audioMuted, setAudioMuted] = useState<boolean>(() => localStorage.getItem("boltorezka_audio_muted") === "1");
  const [lang, setLang] = useState<Lang>(() => detectInitialLang());
  const [selectedUiTheme, setSelectedUiTheme] = useState<UiTheme>(() =>
    normalizeUiTheme(localStorage.getItem("boltorezka_ui_theme"))
  );
  const [profileNameDraft, setProfileNameDraft] = useState("");
  const [profileStatusText, setProfileStatusText] = useState("");
  const [deleteAccountPending, setDeleteAccountPending] = useState(false);
  const [deleteAccountStatusText, setDeleteAccountStatusText] = useState("");
  const [deletedAccountInfo, setDeletedAccountInfo] = useState<{ daysRemaining: number; purgeScheduledAt: string | null } | null>(null);
  const [restoreDeletedAccountPending, setRestoreDeletedAccountPending] = useState(false);
  const [rnnoiseRuntimeStatus, setRnnoiseRuntimeStatus] = useState<"inactive" | "active" | "unavailable" | "error">("inactive");
  const [profileSaving, setProfileSaving] = useState(false);

  const [inputDevices, setInputDevices] = useState<Array<{ id: string; label: string }>>([]);
  const [outputDevices, setOutputDevices] = useState<Array<{ id: string; label: string }>>([]);
  const [videoInputDevices, setVideoInputDevices] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedInputId, setSelectedInputId] = useState<string>(() => localStorage.getItem("boltorezka_selected_input_id") || "default");
  const [selectedOutputId, setSelectedOutputId] = useState<string>(() => localStorage.getItem("boltorezka_selected_output_id") || "default");
  const [selectedVideoInputId, setSelectedVideoInputId] = useState<string>(() => localStorage.getItem("boltorezka_selected_video_input_id") || "default");
  const [cameraEnabled, setCameraEnabled] = useState<boolean>(() => localStorage.getItem("boltorezka_camera_enabled") === "1");
  const [screenShareOwnerByRoomSlug, setScreenShareOwnerByRoomSlug] = useState<Record<string, { userId: string | null; userName: string | null }>>({});
  const [voiceCameraEnabledByUserIdInCurrentRoom, setVoiceCameraEnabledByUserIdInCurrentRoom] = useState<Record<string, boolean>>({});
  const [voiceInitialMicStateByUserIdInCurrentRoom, setVoiceInitialMicStateByUserIdInCurrentRoom] = useState<Record<string, "muted" | "silent" | "speaking">>({});
  const [voiceInitialAudioOutputMutedByUserIdInCurrentRoom, setVoiceInitialAudioOutputMutedByUserIdInCurrentRoom] = useState<Record<string, boolean>>({});

  const [selectedInputProfile, setSelectedInputProfile] = useState<InputProfile>(() => {
    const value = asTrimmedString(localStorage.getItem("boltorezka_selected_input_profile"));
    if (value === "studio" || value === "custom") {
      return value;
    }
    return "custom";
  });
  const [rnnoiseSuppressionLevel, setRnnoiseSuppressionLevel] = useState<RnnoiseSuppressionLevel>(() => {
    const value = asTrimmedString(localStorage.getItem("boltorezka_rnnoise_level"));
    if (value === "none" || value === "soft" || value === "medium" || value === "strong") {
      return value;
    }
    return "medium";
  });
  const [preRnnEchoCancellationEnabled, setPreRnnEchoCancellationEnabled] = useState<boolean>(() => localStorage.getItem("boltorezka_pre_rnn_echo_cancellation") !== "0");
  const [preRnnAutoGainControlEnabled, setPreRnnAutoGainControlEnabled] = useState<boolean>(() => localStorage.getItem("boltorezka_pre_rnn_agc") !== "0");
  const [selfMonitorEnabled, setSelfMonitorEnabled] = useState<boolean>(() => localStorage.getItem("boltorezka_self_monitor") === "1");
  const [walkieTalkieEnabled, setWalkieTalkieEnabled] = useState<boolean>(() => localStorage.getItem("boltorezka_walkie_talkie_enabled") === "1");
  const [walkieTalkieHotkey, setWalkieTalkieHotkey] = useState<string>(() =>
    normalizePushToTalkHotkey(localStorage.getItem("boltorezka_walkie_talkie_hotkey") || DEFAULT_PUSH_TO_TALK_HOTKEY)
  );

  const [mediaDevicesState, setMediaDevicesState] = useState<MediaDevicesState>("ready");
  const [mediaDevicesHint, setMediaDevicesHint] = useState("");
  const [micVolume, setMicVolume] = useState<number>(() => readNonZeroDefaultVolume("boltorezka_mic_volume", DEFAULT_MIC_VOLUME));
  const [outputVolume, setOutputVolume] = useState<number>(() => readNonZeroDefaultVolume("boltorezka_output_volume", DEFAULT_OUTPUT_VOLUME));
  const [micTestLevel, setMicTestLevel] = useState(0);

  const [serverAudioQuality, setServerAudioQuality] = useState<AudioQuality>("standard");
  const [serverAudioQualitySaving, setServerAudioQualitySaving] = useState(false);
  const [serverChatImagePolicy, setServerChatImagePolicy] = useState({
    maxDataUrlLength: DEFAULT_CHAT_IMAGE_DATA_URL_LENGTH,
    maxImageSide: DEFAULT_CHAT_IMAGE_MAX_SIDE,
    jpegQuality: DEFAULT_CHAT_IMAGE_QUALITY
  });
  const [serverVideoEffectType, setServerVideoEffectType] = useState<ServerVideoEffectType>(() => {
    const value = localStorage.getItem("boltorezka_server_video_effect_type");
    if (value === "none" || value === "pixel8" || value === "ascii") {
      return value;
    }
    return "none";
  });
  const [serverVideoResolution, setServerVideoResolution] = useState<ServerVideoResolution>(() => {
    const value = localStorage.getItem("boltorezka_server_video_resolution");
    if (value === "160x120" || value === "320x240" || value === "640x480") {
      return value;
    }
    return "320x240";
  });
  const [serverVideoFps, setServerVideoFps] = useState<10 | 15 | 24 | 30>(() => {
    const value = Number(localStorage.getItem("boltorezka_server_video_fps"));
    if (value === 10 || value === 15 || value === 24 || value === 30) {
      return value;
    }
    return 15;
  });
  const [serverScreenShareResolution, setServerScreenShareResolution] = useState<ServerScreenShareResolution>(() => {
    const value = localStorage.getItem("boltorezka_server_screen_share_resolution");
    if (value === "hd" || value === "fullhd" || value === "max") {
      return value;
    }
    return "fullhd";
  });
  const [serverVideoPixelFxStrength, setServerVideoPixelFxStrength] = useState(() => {
    const value = Number(localStorage.getItem("boltorezka_server_video_fx_strength"));
    return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 85;
  });
  const [serverVideoPixelFxPixelSize, setServerVideoPixelFxPixelSize] = useState(() => {
    const value = Number(localStorage.getItem("boltorezka_server_video_fx_pixel_size"));
    return Number.isFinite(value) ? Math.max(2, Math.min(10, value)) : 5;
  });
  const [serverVideoPixelFxGridThickness, setServerVideoPixelFxGridThickness] = useState(() => {
    const value = Number(localStorage.getItem("boltorezka_server_video_fx_grid_thickness"));
    return Number.isFinite(value) ? Math.max(1, Math.min(4, Math.round(value))) : 1;
  });
  const [serverVideoAsciiCellSize, setServerVideoAsciiCellSize] = useState(() => {
    const value = Number(localStorage.getItem("boltorezka_server_video_ascii_cell_size"));
    return Number.isFinite(value) ? Math.max(4, Math.min(16, Math.round(value))) : 8;
  });
  const [serverVideoAsciiContrast, setServerVideoAsciiContrast] = useState(() => {
    const value = Number(localStorage.getItem("boltorezka_server_video_ascii_contrast"));
    return Number.isFinite(value) ? Math.max(60, Math.min(200, Math.round(value))) : 120;
  });
  const [serverVideoAsciiColor, setServerVideoAsciiColor] = useState(() => {
    const value = asTrimmedString(localStorage.getItem("boltorezka_server_video_ascii_color"));
    return /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#eaffff";
  });
  const [serverVideoWindowMinWidth, setServerVideoWindowMinWidth] = useState(() => {
    const value = Number(localStorage.getItem("boltorezka_server_video_window_min_width"));
    return Number.isFinite(value) ? Math.max(80, Math.min(300, Math.round(value))) : 100;
  });
  const [serverVideoWindowMaxWidth, setServerVideoWindowMaxWidth] = useState(() => {
    const value = Number(localStorage.getItem("boltorezka_server_video_window_max_width"));
    return Number.isFinite(value) ? Math.max(120, Math.min(480, Math.round(value))) : 320;
  });

  return {
    micMuted, setMicMuted,
    audioMuted, setAudioMuted,
    lang, setLang,
    selectedUiTheme, setSelectedUiTheme,
    profileNameDraft, setProfileNameDraft,
    profileStatusText, setProfileStatusText,
    deleteAccountPending, setDeleteAccountPending,
    deleteAccountStatusText, setDeleteAccountStatusText,
    deletedAccountInfo, setDeletedAccountInfo,
    restoreDeletedAccountPending, setRestoreDeletedAccountPending,
    rnnoiseRuntimeStatus, setRnnoiseRuntimeStatus,
    profileSaving, setProfileSaving,
    inputDevices, setInputDevices,
    outputDevices, setOutputDevices,
    videoInputDevices, setVideoInputDevices,
    selectedInputId, setSelectedInputId,
    selectedOutputId, setSelectedOutputId,
    selectedVideoInputId, setSelectedVideoInputId,
    cameraEnabled, setCameraEnabled,
    screenShareOwnerByRoomSlug, setScreenShareOwnerByRoomSlug,
    voiceCameraEnabledByUserIdInCurrentRoom, setVoiceCameraEnabledByUserIdInCurrentRoom,
    voiceInitialMicStateByUserIdInCurrentRoom, setVoiceInitialMicStateByUserIdInCurrentRoom,
    voiceInitialAudioOutputMutedByUserIdInCurrentRoom, setVoiceInitialAudioOutputMutedByUserIdInCurrentRoom,
    selectedInputProfile, setSelectedInputProfile,
    rnnoiseSuppressionLevel, setRnnoiseSuppressionLevel,
    preRnnEchoCancellationEnabled, setPreRnnEchoCancellationEnabled,
    preRnnAutoGainControlEnabled, setPreRnnAutoGainControlEnabled,
    selfMonitorEnabled, setSelfMonitorEnabled,
    walkieTalkieEnabled, setWalkieTalkieEnabled,
    walkieTalkieHotkey, setWalkieTalkieHotkey,
    mediaDevicesState, setMediaDevicesState,
    mediaDevicesHint, setMediaDevicesHint,
    micVolume, setMicVolume,
    outputVolume, setOutputVolume,
    micTestLevel, setMicTestLevel,
    serverAudioQuality, setServerAudioQuality,
    serverAudioQualitySaving, setServerAudioQualitySaving,
    serverChatImagePolicy, setServerChatImagePolicy,
    serverVideoEffectType, setServerVideoEffectType,
    serverVideoResolution, setServerVideoResolution,
    serverVideoFps, setServerVideoFps,
    serverScreenShareResolution, setServerScreenShareResolution,
    serverVideoPixelFxStrength, setServerVideoPixelFxStrength,
    serverVideoPixelFxPixelSize, setServerVideoPixelFxPixelSize,
    serverVideoPixelFxGridThickness, setServerVideoPixelFxGridThickness,
    serverVideoAsciiCellSize, setServerVideoAsciiCellSize,
    serverVideoAsciiContrast, setServerVideoAsciiContrast,
    serverVideoAsciiColor, setServerVideoAsciiColor,
    serverVideoWindowMinWidth, setServerVideoWindowMinWidth,
    serverVideoWindowMaxWidth, setServerVideoWindowMaxWidth
  };
}