import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { VoiceSettingsPanel } from "../../components";
import type { ServerSoundEvent } from "../media/useServerSounds";

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
  playServerSound: (event: ServerSoundEvent) => Promise<void> | void;
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
  setVoiceSettingsPanel,
  playServerSound
}: UseWorkspaceVoiceControlActionsArgs) {
  const handleToggleMic = useCallback(() => {
    setMicMuted((value) => {
      const nextMuted = !value;
      if (!nextMuted) {
        // Размьютим микрофон → имплицитно включаем наушники (нельзя говорить в оффе).
        setAudioMuted(false);
      }
      void playServerSound(nextMuted ? "self_mic_off" : "self_mic_on");
      return nextMuted;
    });
  }, [playServerSound, setAudioMuted, setMicMuted]);

  const handleToggleAudio = useCallback(() => {
    setAudioMuted((value) => {
      const nextMuted = !value;
      if (nextMuted) {
        // Глушим наушники → автоматически мьютим микрофон (deafen не ломает этикет разговора).
        setMicMuted(true);
      }
      void playServerSound(nextMuted ? "self_audio_off" : "self_audio_on");
      return nextMuted;
    });
  }, [playServerSound, setAudioMuted, setMicMuted]);

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
