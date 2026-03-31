import { useEffect } from "react";

type UseVoiceRoomLifecycleEffectsInput = {
  roomSlug: string;
  currentRoomSnapshot: unknown;
  allowVideoStreaming: boolean;
  setCameraEnabled: (value: boolean) => void;
  setVideoWindowsVisible: (value: boolean) => void;
  setVoiceCameraEnabledByUserIdInCurrentRoom: (value: Record<string, boolean>) => void;
  setVoiceInitialMicStateByUserIdInCurrentRoom: (value: Record<string, "muted" | "silent" | "speaking">) => void;
  setVoiceInitialAudioOutputMutedByUserIdInCurrentRoom: (value: Record<string, boolean>) => void;
};

export function useVoiceRoomLifecycleEffects({
  roomSlug,
  currentRoomSnapshot,
  allowVideoStreaming,
  setCameraEnabled,
  setVideoWindowsVisible,
  setVoiceCameraEnabledByUserIdInCurrentRoom,
  setVoiceInitialMicStateByUserIdInCurrentRoom,
  setVoiceInitialAudioOutputMutedByUserIdInCurrentRoom
}: UseVoiceRoomLifecycleEffectsInput) {
  useEffect(() => {
    // Wait until room metadata is resolved; otherwise boot-time fallback to "text"
    // can incorrectly clear persisted camera state on page reload.
    if (!currentRoomSnapshot) {
      return;
    }

    if (!allowVideoStreaming) {
      setCameraEnabled(false);
      setVideoWindowsVisible(true);
    }
  }, [allowVideoStreaming, currentRoomSnapshot, setCameraEnabled, setVideoWindowsVisible]);

  useEffect(() => {
    setVoiceCameraEnabledByUserIdInCurrentRoom({});
    setVoiceInitialMicStateByUserIdInCurrentRoom({});
    setVoiceInitialAudioOutputMutedByUserIdInCurrentRoom({});
  }, [
    roomSlug,
    setVoiceCameraEnabledByUserIdInCurrentRoom,
    setVoiceInitialMicStateByUserIdInCurrentRoom,
    setVoiceInitialAudioOutputMutedByUserIdInCurrentRoom
  ]);
}