import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { PresenceMember } from "../../domain";

type UseRealtimeConnectionResetArgs = {
  wsState: "disconnected" | "connecting" | "connected";
  setRoomsPresenceBySlug: Dispatch<SetStateAction<Record<string, string[]>>>;
  setRoomsPresenceDetailsBySlug: Dispatch<SetStateAction<Record<string, PresenceMember[]>>>;
  setRoomMediaTopologyBySlug: Dispatch<SetStateAction<Record<string, "livekit">>>;
  setScreenShareOwnerByRoomSlug: Dispatch<SetStateAction<Record<string, { userId: string | null; userName: string | null }>>>;
  setVoiceInitialMicStateByUserIdInCurrentRoom: Dispatch<SetStateAction<Record<string, "muted" | "silent" | "speaking">>>;
  setVoiceInitialAudioOutputMutedByUserIdInCurrentRoom: Dispatch<SetStateAction<Record<string, boolean>>>;
};

export function useRealtimeConnectionReset({
  wsState,
  setRoomsPresenceBySlug,
  setRoomsPresenceDetailsBySlug,
  setRoomMediaTopologyBySlug,
  setScreenShareOwnerByRoomSlug,
  setVoiceInitialMicStateByUserIdInCurrentRoom,
  setVoiceInitialAudioOutputMutedByUserIdInCurrentRoom
}: UseRealtimeConnectionResetArgs) {
  useEffect(() => {
    if (wsState === "connected") {
      return;
    }

    setRoomsPresenceBySlug({});
    setRoomsPresenceDetailsBySlug({});
    setRoomMediaTopologyBySlug({});
    setScreenShareOwnerByRoomSlug({});
    setVoiceInitialMicStateByUserIdInCurrentRoom({});
    setVoiceInitialAudioOutputMutedByUserIdInCurrentRoom({});
  }, [
    setRoomMediaTopologyBySlug,
    setRoomsPresenceBySlug,
    setRoomsPresenceDetailsBySlug,
    setScreenShareOwnerByRoomSlug,
    setVoiceInitialAudioOutputMutedByUserIdInCurrentRoom,
    setVoiceInitialMicStateByUserIdInCurrentRoom,
    wsState
  ]);
}
