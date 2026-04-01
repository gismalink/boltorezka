import { useEffect, type Dispatch, type SetStateAction } from "react";

type UseVoiceUiLifecycleEffectsArgs = {
  userSettingsOpen: boolean;
  userSettingsTab: string;
  setSelfMonitorEnabled: Dispatch<SetStateAction<boolean>>;
  roomSlug: string;
  roomMediaTopologyBySlug: Record<string, "livekit">;
  pushCallLog: (text: string) => void;
};

export function useVoiceUiLifecycleEffects({
  userSettingsOpen,
  userSettingsTab,
  setSelfMonitorEnabled,
  roomSlug,
  roomMediaTopologyBySlug,
  pushCallLog
}: UseVoiceUiLifecycleEffectsArgs) {
  useEffect(() => {
    if (userSettingsOpen && userSettingsTab === "sound") {
      return;
    }

    setSelfMonitorEnabled(false);
  }, [userSettingsOpen, userSettingsTab, setSelfMonitorEnabled]);

  useEffect(() => {
    if (!roomSlug) {
      return;
    }

    const topologyBySlug = roomMediaTopologyBySlug || {};
    const roomTopology = topologyBySlug[roomSlug];
    if (roomTopology === "livekit") {
      pushCallLog(`media topology for ${roomSlug}: ${roomTopology}`);
    }
  }, [roomSlug, roomMediaTopologyBySlug, pushCallLog]);
}
