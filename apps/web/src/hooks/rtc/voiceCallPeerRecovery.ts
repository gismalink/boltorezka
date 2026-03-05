import {
  decrementVoiceCounter,
  incrementVoiceCounter,
  logVoiceDiagnostics
} from "../../utils/voiceDiagnostics";
import type { MutableRefObject } from "react";
import {
  RTC_INBOUND_STALL_TICKS,
  RTC_RECONNECT_BASE_DELAY_MS,
  RTC_RECONNECT_MAX_ATTEMPTS,
  RTC_RECONNECT_MAX_DELAY_MS,
  RTC_STATS_POLL_MS
} from "./voiceCallConfig";
import type { OfferReason } from "./voiceCallOfferPolicy";
import type { VoicePeersRef } from "./voiceCallTypes";

type StartOfferFn = (
  targetUserId: string,
  targetLabel: string,
  options?: { iceRestart?: boolean; reason?: OfferReason }
) => Promise<void> | void;

export function clearPeerReconnectTimerForTarget(peersRef: VoicePeersRef, targetUserId: string): void {
  const peer = peersRef.current.get(targetUserId);
  if (!peer || peer.reconnectTimer === null) {
    return;
  }

  window.clearTimeout(peer.reconnectTimer);
  peer.reconnectTimer = null;
  decrementVoiceCounter("runtimeReconnectTimers");
  logVoiceDiagnostics("runtime reconnect timer cleared", { targetUserId });
}

export function clearPeerStatsTimerForTarget(peersRef: VoicePeersRef, targetUserId: string): void {
  const peer = peersRef.current.get(targetUserId);
  if (!peer || peer.statsTimer === null) {
    return;
  }

  window.clearInterval(peer.statsTimer);
  peer.statsTimer = null;
}

export function startPeerStatsMonitorForTarget(args: {
  peersRef: VoicePeersRef;
  targetUserId: string;
  targetLabel: string;
  audioMuted: boolean;
  applyRemoteAudioOutput: (element: HTMLAudioElement) => Promise<void>;
  pushCallLog: (message: string) => void;
  shouldInitiateOffer: (targetUserId: string) => boolean;
  startOffer: StartOfferFn | null;
}): void {
  const {
    peersRef,
    targetUserId,
    targetLabel,
    audioMuted,
    applyRemoteAudioOutput,
    pushCallLog,
    shouldInitiateOffer,
    startOffer
  } = args;

  const peer = peersRef.current.get(targetUserId);
  if (!peer || peer.statsTimer !== null) {
    return;
  }

  // Polling stats lets us detect silent inbound stalls that do not trigger RTC state changes.
  peer.statsTimer = window.setInterval(() => {
    const current = peersRef.current.get(targetUserId);
    if (!current) {
      return;
    }

    const state = current.connection.connectionState;
    if (state !== "connected" && !current.hasRemoteTrack) {
      return;
    }

    void current.connection.getStats()
      .then((report) => {
        let inboundBytes = 0;
        let outboundBytes = 0;
        report.forEach((item) => {
          if (item.type === "inbound-rtp") {
            const mediaType = (item as RTCInboundRtpStreamStats & { mediaType?: string }).mediaType;
            const kind = (item as RTCInboundRtpStreamStats & { kind?: string }).kind;
            const isAudio = mediaType === "audio" || kind === "audio";
            if (!isAudio) {
              return;
            }

            inboundBytes += Number((item as RTCInboundRtpStreamStats).bytesReceived || 0);
            return;
          }

          if (item.type === "outbound-rtp") {
            const mediaType = (item as RTCOutboundRtpStreamStats & { mediaType?: string }).mediaType;
            const kind = (item as RTCOutboundRtpStreamStats & { kind?: string }).kind;
            const isAudio = mediaType === "audio" || kind === "audio";
            if (!isAudio) {
              return;
            }

            outboundBytes += Number((item as RTCOutboundRtpStreamStats).bytesSent || 0);
          }
        });

        const inboundDelta = inboundBytes - current.lastInboundBytes;
        const outboundDelta = outboundBytes - current.lastOutboundBytes;
        current.lastInboundBytes = inboundBytes;
        current.lastOutboundBytes = outboundBytes;

        if (inboundDelta > 0) {
          if (current.inboundStalled) {
            current.inboundStalled = false;
            current.inboundStalledTicks = 0;
            current.stallRecoveryAttempts = 0;
            pushCallLog(`remote inbound audio resumed <- ${targetLabel || targetUserId}`);
          }

          if (!audioMuted && current.audioElement.paused && current.audioElement.srcObject) {
            void applyRemoteAudioOutput(current.audioElement);
            void current.audioElement.play()
              .then(() => {
                pushCallLog(`remote audio resumed (stats-flow) <- ${targetLabel || targetUserId}`);
              })
              .catch((error) => {
                pushCallLog(`remote audio resume failed (stats-flow, ${targetLabel || targetUserId}): ${(error as Error).message}`);
              });
          }
          return;
        }

        current.inboundStalledTicks += 1;
        if (!current.inboundStalled && current.inboundStalledTicks >= RTC_INBOUND_STALL_TICKS) {
          current.inboundStalled = true;
          pushCallLog(`remote inbound audio stalled <- ${targetLabel || targetUserId} (in:${inboundDelta} out:${outboundDelta})`);

          if (shouldInitiateOffer(targetUserId) && current.stallRecoveryAttempts < 2 && current.connection.connectionState === "connected") {
            current.stallRecoveryAttempts += 1;
            pushCallLog(`rtc stall recovery offer -> ${targetLabel || targetUserId}`);
            void startOffer?.(targetUserId, targetLabel || targetUserId, {
              iceRestart: true,
              reason: "inbound-stalled"
            });
          }
        }
      })
      .catch((error) => {
        pushCallLog(`rtc stats failed (${targetLabel || targetUserId}): ${(error as Error).message}`);
      });
  }, RTC_STATS_POLL_MS);
}

export function schedulePeerReconnectForTarget(args: {
  roomVoiceConnectedRef: MutableRefObject<boolean>;
  peersRef: VoicePeersRef;
  targetUserId: string;
  trigger: string;
  shouldInitiateOffer: (targetUserId: string) => boolean;
  closePeer: (targetUserId: string, reason?: string) => void;
  updateCallStatus: () => void;
  pushCallLog: (message: string) => void;
  startOffer: StartOfferFn | null;
}): void {
  const {
    roomVoiceConnectedRef,
    peersRef,
    targetUserId,
    trigger,
    shouldInitiateOffer,
    closePeer,
    updateCallStatus,
    pushCallLog,
    startOffer
  } = args;

  if (!roomVoiceConnectedRef.current) {
    return;
  }

  if (!shouldInitiateOffer(targetUserId)) {
    closePeer(targetUserId, `rtc ${trigger}, waiting remote re-offer`);
    return;
  }

  const peer = peersRef.current.get(targetUserId);
  if (!peer) {
    return;
  }

  if (peer.reconnectTimer !== null) {
    return;
  }

  if (peer.reconnectAttempts >= RTC_RECONNECT_MAX_ATTEMPTS) {
    closePeer(targetUserId, `rtc ${trigger}, reconnect exhausted: ${peer.label}`);
    return;
  }

  const attempt = peer.reconnectAttempts + 1;
  peer.reconnectAttempts = attempt;
  const delay = Math.min(
    RTC_RECONNECT_MAX_DELAY_MS,
    RTC_RECONNECT_BASE_DELAY_MS * 2 ** (attempt - 1)
  );

  updateCallStatus();
  pushCallLog(`rtc ${trigger}, reconnect ${peer.label} in ${delay}ms (${attempt}/${RTC_RECONNECT_MAX_ATTEMPTS})`);

  peer.reconnectTimer = window.setTimeout(async () => {
    const current = peersRef.current.get(targetUserId);
    if (current) {
      current.reconnectTimer = null;
      decrementVoiceCounter("runtimeReconnectTimers");
    }

    try {
      const label = peersRef.current.get(targetUserId)?.label || targetUserId;
      await startOffer?.(targetUserId, label);
    } catch (error) {
      pushCallLog(`reconnect attempt failed: ${(error as Error).message}`);
    }
  }, delay);
  incrementVoiceCounter("runtimeReconnectTimers");
  logVoiceDiagnostics("runtime reconnect timer scheduled", {
    targetUserId,
    trigger,
    delay,
    attempt
  });
}
