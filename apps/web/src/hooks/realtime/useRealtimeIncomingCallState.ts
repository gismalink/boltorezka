import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { AudioQuality, Room, RoomsTreeResponse } from "../../domain";
import type { ServerScreenShareResolution, ServerVideoEffectType } from "../rtc/voiceCallTypes";

type ServerVideoResolution = "160x120" | "320x240" | "640x480";

type IncomingVideoStatePayload = {
  fromUserId?: string;
  fromUserName?: string;
  roomSlug?: string;
  settings?: Record<string, unknown>;
};

type IncomingMicStatePayload = {
  fromUserId?: string;
  muted?: boolean;
  speaking?: boolean;
  audioMuted?: boolean;
};

type IncomingInitialCallStatePayload = {
  roomSlug?: string;
  participants?: Array<{
    userId?: string;
    userName?: string;
    mic?: {
      muted?: boolean;
      speaking?: boolean;
      audioMuted?: boolean;
    };
    video?: {
      localVideoEnabled?: boolean;
    };
  }>;
};

type IncomingAudioQualityPayload = {
  scope?: unknown;
  audioQuality?: unknown;
  roomId?: unknown;
  audioQualityOverride?: unknown;
};

type UseRealtimeIncomingCallStateArgs = {
  canManageAudioQuality: boolean;
  roomSlugRef: MutableRefObject<string>;
  serverVideoWindowMinWidth: number;
  serverVideoWindowMaxWidth: number;
  handleIncomingRtcVideoState: (payload: IncomingVideoStatePayload) => void;
  setServerVideoEffectType: Dispatch<SetStateAction<ServerVideoEffectType>>;
  setServerVideoResolution: Dispatch<SetStateAction<ServerVideoResolution>>;
  setServerVideoFps: Dispatch<SetStateAction<10 | 15 | 24 | 30>>;
  setServerScreenShareResolution: Dispatch<SetStateAction<ServerScreenShareResolution>>;
  setServerVideoPixelFxStrength: Dispatch<SetStateAction<number>>;
  setServerVideoPixelFxPixelSize: Dispatch<SetStateAction<number>>;
  setServerVideoPixelFxGridThickness: Dispatch<SetStateAction<number>>;
  setServerVideoAsciiCellSize: Dispatch<SetStateAction<number>>;
  setServerVideoAsciiContrast: Dispatch<SetStateAction<number>>;
  setServerVideoAsciiColor: Dispatch<SetStateAction<string>>;
  setServerVideoWindowMinWidth: Dispatch<SetStateAction<number>>;
  setServerVideoWindowMaxWidth: Dispatch<SetStateAction<number>>;
  setVoiceCameraEnabledByUserIdInCurrentRoom: Dispatch<SetStateAction<Record<string, boolean>>>;
  setVoiceInitialMicStateByUserIdInCurrentRoom: Dispatch<SetStateAction<Record<string, "muted" | "silent" | "speaking">>>;
  setVoiceInitialAudioOutputMutedByUserIdInCurrentRoom: Dispatch<SetStateAction<Record<string, boolean>>>;
  setServerAudioQuality: Dispatch<SetStateAction<AudioQuality>>;
  setRooms: Dispatch<SetStateAction<Room[]>>;
  setRoomsTree: Dispatch<SetStateAction<RoomsTreeResponse | null>>;
};

function normalizeIntInRange(value: unknown, min: number, max: number): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function normalizeAudioQuality(value: unknown): AudioQuality | null | undefined {
  if (value === null) {
    return null;
  }

  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "retro" || normalized === "low" || normalized === "standard" || normalized === "high"
    ? normalized
    : undefined;
}

export function useRealtimeIncomingCallState({
  canManageAudioQuality,
  roomSlugRef,
  serverVideoWindowMinWidth,
  serverVideoWindowMaxWidth,
  handleIncomingRtcVideoState,
  setServerVideoEffectType,
  setServerVideoResolution,
  setServerVideoFps,
  setServerScreenShareResolution,
  setServerVideoPixelFxStrength,
  setServerVideoPixelFxPixelSize,
  setServerVideoPixelFxGridThickness,
  setServerVideoAsciiCellSize,
  setServerVideoAsciiContrast,
  setServerVideoAsciiColor,
  setServerVideoWindowMinWidth,
  setServerVideoWindowMaxWidth,
  setVoiceCameraEnabledByUserIdInCurrentRoom,
  setVoiceInitialMicStateByUserIdInCurrentRoom,
  setVoiceInitialAudioOutputMutedByUserIdInCurrentRoom,
  setServerAudioQuality,
  setRooms,
  setRoomsTree
}: UseRealtimeIncomingCallStateArgs) {
  const handleIncomingVideoPolicyState = useCallback((payload: {
    roomSlug?: string;
    settings?: {
      effectType?: unknown;
      resolution?: unknown;
      fps?: unknown;
      screenShareResolution?: unknown;
      pixelFxStrength?: unknown;
      pixelFxPixelSize?: unknown;
      pixelFxGridThickness?: unknown;
      asciiCellSize?: unknown;
      asciiContrast?: unknown;
      asciiColor?: unknown;
      windowMinWidth?: unknown;
      windowMaxWidth?: unknown;
    };
  }) => {
    if (canManageAudioQuality) {
      return;
    }

    const payloadRoomSlug = String(payload.roomSlug || "").trim();
    if (payloadRoomSlug && payloadRoomSlug !== roomSlugRef.current) {
      return;
    }

    const settings = payload.settings;
    if (!settings) {
      return;
    }

    const effectType = String(settings.effectType || "").trim();
    if (effectType === "none" || effectType === "pixel8" || effectType === "ascii") {
      setServerVideoEffectType(effectType);
    }

    const resolution = String(settings.resolution || "").trim();
    if (resolution === "160x120" || resolution === "320x240" || resolution === "640x480") {
      setServerVideoResolution(resolution);
    }

    const fps = Number(settings.fps);
    if (fps === 10 || fps === 15 || fps === 24 || fps === 30) {
      setServerVideoFps(fps);
    }

    const screenShareResolution = String(settings.screenShareResolution || "").trim();
    if (screenShareResolution === "hd" || screenShareResolution === "fullhd" || screenShareResolution === "max") {
      setServerScreenShareResolution(screenShareResolution);
    }

    const pixelFxStrength = normalizeIntInRange(settings.pixelFxStrength, 0, 100);
    if (pixelFxStrength !== null) {
      setServerVideoPixelFxStrength(pixelFxStrength);
    }

    const pixelFxPixelSize = normalizeIntInRange(settings.pixelFxPixelSize, 2, 10);
    if (pixelFxPixelSize !== null) {
      setServerVideoPixelFxPixelSize(pixelFxPixelSize);
    }

    const pixelFxGridThickness = normalizeIntInRange(settings.pixelFxGridThickness, 1, 4);
    if (pixelFxGridThickness !== null) {
      setServerVideoPixelFxGridThickness(pixelFxGridThickness);
    }

    const asciiCellSize = normalizeIntInRange(settings.asciiCellSize, 4, 16);
    if (asciiCellSize !== null) {
      setServerVideoAsciiCellSize(asciiCellSize);
    }

    const asciiContrast = normalizeIntInRange(settings.asciiContrast, 60, 200);
    if (asciiContrast !== null) {
      setServerVideoAsciiContrast(asciiContrast);
    }

    const asciiColor = String(settings.asciiColor || "").trim();
    if (/^#[0-9a-fA-F]{6}$/.test(asciiColor)) {
      setServerVideoAsciiColor(asciiColor);
    }

    const minWidth = normalizeIntInRange(settings.windowMinWidth, 80, 300);
    const maxWidthBase = normalizeIntInRange(settings.windowMaxWidth, 120, 480);
    if (minWidth !== null || maxWidthBase !== null) {
      const nextMinWidth = minWidth ?? serverVideoWindowMinWidth;
      const nextMaxWidth = Math.max(maxWidthBase ?? serverVideoWindowMaxWidth, nextMinWidth);
      setServerVideoWindowMinWidth(nextMinWidth);
      setServerVideoWindowMaxWidth(nextMaxWidth);
    }
  }, [
    canManageAudioQuality,
    roomSlugRef,
    serverVideoWindowMaxWidth,
    serverVideoWindowMinWidth,
    setServerVideoAsciiCellSize,
    setServerVideoAsciiColor,
    setServerVideoAsciiContrast,
    setServerVideoEffectType,
    setServerVideoFps,
    setServerScreenShareResolution,
    setServerVideoPixelFxGridThickness,
    setServerVideoPixelFxPixelSize,
    setServerVideoPixelFxStrength,
    setServerVideoResolution,
    setServerVideoWindowMaxWidth,
    setServerVideoWindowMinWidth
  ]);

  const handleIncomingVideoState = useCallback((payload: IncomingVideoStatePayload) => {
    const fromUserId = String(payload.fromUserId || "").trim();
    const payloadRoomSlug = String(payload.roomSlug || "").trim();
    const localVideoEnabled = payload.settings?.localVideoEnabled;
    if (fromUserId && typeof localVideoEnabled === "boolean" && (!payloadRoomSlug || payloadRoomSlug === roomSlugRef.current)) {
      setVoiceCameraEnabledByUserIdInCurrentRoom((prev) => ({
        ...prev,
        [fromUserId]: localVideoEnabled
      }));
    }

    handleIncomingRtcVideoState(payload);
    handleIncomingVideoPolicyState(payload);
  }, [handleIncomingRtcVideoState, handleIncomingVideoPolicyState, roomSlugRef, setVoiceCameraEnabledByUserIdInCurrentRoom]);

  const handleIncomingMicState = useCallback((payload: IncomingMicStatePayload) => {
    const fromUserId = String(payload.fromUserId || "").trim();
    if (!fromUserId) {
      return;
    }

    setVoiceInitialMicStateByUserIdInCurrentRoom((prev) => {
      const muted = payload.muted === true;
      const speaking = payload.speaking === true;
      const nextState: "muted" | "silent" | "speaking" = muted ? "muted" : speaking ? "speaking" : "silent";
      if (prev[fromUserId] === nextState) {
        return prev;
      }
      return {
        ...prev,
        [fromUserId]: nextState
      };
    });

    if (typeof payload.audioMuted === "boolean") {
      const nextAudioMuted = payload.audioMuted;
      setVoiceInitialAudioOutputMutedByUserIdInCurrentRoom((prev) => {
        if (prev[fromUserId] === nextAudioMuted) {
          return prev;
        }
        return {
          ...prev,
          [fromUserId]: nextAudioMuted
        };
      });
    }
  }, [setVoiceInitialAudioOutputMutedByUserIdInCurrentRoom, setVoiceInitialMicStateByUserIdInCurrentRoom]);

  const handleIncomingInitialCallState = useCallback((payload: IncomingInitialCallStatePayload) => {
    const payloadRoomSlug = String(payload.roomSlug || "").trim();
    if (payloadRoomSlug && payloadRoomSlug !== roomSlugRef.current) {
      return;
    }

    const participants = Array.isArray(payload.participants) ? payload.participants : [];
    const nextMicState: Record<string, "muted" | "silent" | "speaking"> = {};
    const nextAudioMutedState: Record<string, boolean> = {};
    const nextCameraState: Record<string, boolean> = {};

    participants.forEach((participant) => {
      const userId = String(participant?.userId || "").trim();
      if (!userId) {
        return;
      }

      const micMuted = participant?.mic?.muted === true;
      const micSpeaking = participant?.mic?.speaking === true;
      nextMicState[userId] = micMuted ? "muted" : micSpeaking ? "speaking" : "silent";
      nextAudioMutedState[userId] = participant?.mic?.audioMuted === true;
      nextCameraState[userId] = participant?.video?.localVideoEnabled === true;
    });

    setVoiceInitialMicStateByUserIdInCurrentRoom(nextMicState);
    setVoiceInitialAudioOutputMutedByUserIdInCurrentRoom(nextAudioMutedState);
    // Initial state should replace previous snapshot for this room to avoid stale ghost entries.
    setVoiceCameraEnabledByUserIdInCurrentRoom(nextCameraState);
  }, [
    roomSlugRef,
    setVoiceCameraEnabledByUserIdInCurrentRoom,
    setVoiceInitialAudioOutputMutedByUserIdInCurrentRoom,
    setVoiceInitialMicStateByUserIdInCurrentRoom
  ]);

  const handleAudioQualityUpdated = useCallback((payload: IncomingAudioQualityPayload) => {
    const scope = String(payload.scope || "").trim();

    if (scope === "server") {
      const nextAudioQuality = normalizeAudioQuality(payload.audioQuality);
      if (nextAudioQuality && nextAudioQuality !== null) {
        setServerAudioQuality(nextAudioQuality);
      }
      return;
    }

    if (scope !== "room") {
      return;
    }

    const roomId = String(payload.roomId || "").trim();
    if (!roomId) {
      return;
    }

    const normalizedOverride = normalizeAudioQuality(payload.audioQualityOverride);
    if (typeof normalizedOverride === "undefined") {
      return;
    }

    setRooms((prev) => prev.map((room) => (room.id === roomId ? { ...room, audio_quality_override: normalizedOverride } : room)));
    setRoomsTree((prev) => {
      if (!prev) {
        return prev;
      }

      const patchRoom = (room: Room) => (room.id === roomId ? { ...room, audio_quality_override: normalizedOverride } : room);

      return {
        ...prev,
        categories: (prev.categories || []).map((category) => ({
          ...category,
          channels: (category.channels || []).map(patchRoom)
        })),
        uncategorized: (prev.uncategorized || []).map(patchRoom)
      };
    });
  }, [setRooms, setRoomsTree, setServerAudioQuality]);

  return {
    handleIncomingVideoState,
    handleIncomingMicState,
    handleIncomingInitialCallState,
    handleAudioQualityUpdated
  };
}
