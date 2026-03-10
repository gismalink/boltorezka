import type { RoomKind } from "../../domain";

type RoomMediaCapabilities = {
  supportsText: boolean;
  supportsVoice: boolean;
  supportsCamera: boolean;
  supportsScreenShare: boolean;
};

/**
 * Canonical room-media rules shared across UI and runtime wiring.
 */
export function useRoomMediaCapabilities(roomKind: RoomKind): RoomMediaCapabilities {
  const supportsVoice = roomKind !== "text";
  const supportsCamera = roomKind === "text_voice_video";

  return {
    supportsText: true,
    supportsVoice,
    supportsCamera,
    supportsScreenShare: supportsVoice
  };
}
