import { useEffect, useRef } from "react";
import type { ServerScreenShareResolution, ServerVideoEffectType } from "../rtc/voiceCallTypes";

type SendWsEvent = (
  eventType: string,
  payload: Record<string, unknown>,
  options?: { withIdempotency?: boolean; trackAck?: boolean; maxRetries?: number }
) => string | null;

type UseVoiceSignalingOrchestratorArgs = {
  roomVoiceConnected: boolean;
  currentRoomSupportsRtc: boolean;
  micMuted: boolean;
  micTestLevel: number;
  audioMuted: boolean;
  canManageAudioQuality: boolean;
  videoPolicyAudienceKey: string;
  serverVideoEffectType: ServerVideoEffectType;
  serverVideoResolution: string;
  serverVideoFps: 10 | 15 | 24 | 30;
  serverScreenShareResolution: ServerScreenShareResolution;
  serverVideoPixelFxStrength: number;
  serverVideoPixelFxPixelSize: number;
  serverVideoPixelFxGridThickness: number;
  serverVideoAsciiCellSize: number;
  serverVideoAsciiContrast: number;
  serverVideoAsciiColor: string;
  serverVideoWindowMinWidth: number;
  serverVideoWindowMaxWidth: number;
  sendWsEvent: SendWsEvent;
};

const LOCAL_SPEAKING_THRESHOLD = 0.055;

export function useVoiceSignalingOrchestrator({
  roomVoiceConnected,
  currentRoomSupportsRtc,
  micMuted,
  micTestLevel,
  audioMuted,
  canManageAudioQuality,
  videoPolicyAudienceKey,
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
  serverVideoWindowMaxWidth,
  sendWsEvent
}: UseVoiceSignalingOrchestratorArgs) {
  const lastBroadcastVideoPolicyRef = useRef("");
  const lastBroadcastMicStateRef = useRef("");

  useEffect(() => {
    if (!roomVoiceConnected || !currentRoomSupportsRtc) {
      lastBroadcastMicStateRef.current = "";
      return;
    }

    const speaking = !micMuted && micTestLevel >= LOCAL_SPEAKING_THRESHOLD;
    const signature = `${micMuted ? 1 : 0}:${speaking ? 1 : 0}:${audioMuted ? 1 : 0}`;
    if (lastBroadcastMicStateRef.current === signature) {
      return;
    }

    const requestId = sendWsEvent(
      "call.mic_state",
      {
        muted: micMuted,
        speaking,
        audioMuted
      },
      { maxRetries: 1 }
    );

    if (requestId) {
      lastBroadcastMicStateRef.current = signature;
    }
  }, [audioMuted, currentRoomSupportsRtc, micMuted, micTestLevel, roomVoiceConnected, sendWsEvent]);

  useEffect(() => {
    if (!currentRoomSupportsRtc || !canManageAudioQuality) {
      return;
    }

    const payload = {
      effectType: serverVideoEffectType,
      resolution: serverVideoResolution,
      fps: serverVideoFps,
      pixelFxStrength: serverVideoPixelFxStrength,
      pixelFxPixelSize: serverVideoPixelFxPixelSize,
      pixelFxGridThickness: serverVideoPixelFxGridThickness,
      asciiCellSize: serverVideoAsciiCellSize,
      asciiContrast: serverVideoAsciiContrast,
      asciiColor: serverVideoAsciiColor,
      windowMinWidth: Math.min(serverVideoWindowMinWidth, serverVideoWindowMaxWidth),
      windowMaxWidth: Math.max(serverVideoWindowMinWidth, serverVideoWindowMaxWidth),
      screenShareResolution: serverScreenShareResolution
    };

    const serialized = JSON.stringify({ payload, audience: videoPolicyAudienceKey });
    if (lastBroadcastVideoPolicyRef.current === serialized) {
      return;
    }

    lastBroadcastVideoPolicyRef.current = serialized;
    sendWsEvent("call.video_state", { settings: payload }, { maxRetries: 1 });
  }, [
    currentRoomSupportsRtc,
    canManageAudioQuality,
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
    serverVideoWindowMaxWidth,
    videoPolicyAudienceKey,
    sendWsEvent
  ]);
}
