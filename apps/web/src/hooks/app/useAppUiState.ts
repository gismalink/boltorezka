import { useState } from "react";
import type { VoiceSettingsPanel } from "../../components";

export type AppServerMenuTab = "users" | "events" | "telemetry" | "call" | "sound" | "video" | "chat_images";
export type AppMobileTab = "channels" | "chat" | "settings";

export function useAppUiState() {
  const [audioOutputMenuOpen, setAudioOutputMenuOpen] = useState(false);
  const [voiceSettingsOpen, setVoiceSettingsOpen] = useState(false);
  const [userSettingsOpen, setUserSettingsOpen] = useState(false);
  const [userSettingsTab, setUserSettingsTab] = useState<"profile" | "sound" | "camera" | "server_sounds">("profile");
  const [voiceSettingsPanel, setVoiceSettingsPanel] = useState<VoiceSettingsPanel>(null);
  const [authMenuOpen, setAuthMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [appMenuOpen, setAppMenuOpen] = useState(false);
  const [serverMenuTab, setServerMenuTab] = useState<AppServerMenuTab>("events");
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [mobileTab, setMobileTab] = useState<AppMobileTab>("channels");
  const [videoWindowsVisible, setVideoWindowsVisible] = useState(true);

  return {
    audioOutputMenuOpen,
    setAudioOutputMenuOpen,
    voiceSettingsOpen,
    setVoiceSettingsOpen,
    userSettingsOpen,
    setUserSettingsOpen,
    userSettingsTab,
    setUserSettingsTab,
    voiceSettingsPanel,
    setVoiceSettingsPanel,
    authMenuOpen,
    setAuthMenuOpen,
    profileMenuOpen,
    setProfileMenuOpen,
    appMenuOpen,
    setAppMenuOpen,
    serverMenuTab,
    setServerMenuTab,
    isMobileViewport,
    setIsMobileViewport,
    mobileTab,
    setMobileTab,
    videoWindowsVisible,
    setVideoWindowsVisible
  };
}
