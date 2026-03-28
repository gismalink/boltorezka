import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { VoiceSettingsPanel } from "../../components";

type UseWorkspaceVoiceControlActionsArgs = {
  allowVideoStreaming: boolean;
  cameraEnabled: boolean;
  requestVideoAccess: () => void;
  handleToggleScreenShare: () => Promise<void>;
  setMicMuted: Dispatch<SetStateAction<boolean>>;
  setAudioMuted: Dispatch<SetStateAction<boolean>>;
  setCameraEnabled: Dispatch<SetStateAction<boolean>>;
  setAudioOutputMenuOpen: Dispatch<SetStateAction<boolean>>;
  setVoiceSettingsOpen: Dispatch<SetStateAction<boolean>>;
  setVoiceSettingsPanel: Dispatch<SetStateAction<VoiceSettingsPanel>>;
};

export function useWorkspaceVoiceControlActions({
  allowVideoStreaming,
  cameraEnabled,
  requestVideoAccess,
  handleToggleScreenShare,
  setMicMuted,
  setAudioMuted,
  setCameraEnabled,
  setAudioOutputMenuOpen,
  setVoiceSettingsOpen,
  setVoiceSettingsPanel
}: UseWorkspaceVoiceControlActionsArgs) {
  const handleToggleMic = useCallback(() => {
    setMicMuted((value) => {
      const nextMuted = !value;
      if (!nextMuted) {
        setAudioMuted(false);
      }
      return nextMuted;
    });
  }, [setAudioMuted, setMicMuted]);

  const handleToggleAudio = useCallback(() => {
    setAudioMuted((value) => {
      const nextMuted = !value;
      if (nextMuted) {
        setMicMuted(true);
      }
      return nextMuted;
    });
  }, [setAudioMuted, setMicMuted]);

  const handleToggleCamera = useCallback(() => {
    if (allowVideoStreaming && !cameraEnabled) {
      requestVideoAccess();
    }
    setCameraEnabled((value) => !value);
  }, [allowVideoStreaming, cameraEnabled, requestVideoAccess, setCameraEnabled]);

  const handleToggleScreenShareClick = useCallback(() => {
    void handleToggleScreenShare();
  }, [handleToggleScreenShare]);

  const handleToggleVoiceSettings = useCallback(() => {
    setAudioOutputMenuOpen(false);
    setVoiceSettingsPanel(null);
    setVoiceSettingsOpen((value) => !value);
  }, [setAudioOutputMenuOpen, setVoiceSettingsOpen, setVoiceSettingsPanel]);

  const handleToggleAudioOutput = useCallback(() => {
    setVoiceSettingsOpen(false);
    setVoiceSettingsPanel(null);
    setAudioOutputMenuOpen((value) => !value);
  }, [setAudioOutputMenuOpen, setVoiceSettingsOpen, setVoiceSettingsPanel]);

  return {
    handleToggleMic,
    handleToggleAudio,
    handleToggleCamera,
    handleToggleScreenShareClick,
    handleToggleVoiceSettings,
    handleToggleAudioOutput
  };
}
