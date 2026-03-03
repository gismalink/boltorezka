import { useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import { logVoiceDiagnostics } from "../utils/voiceDiagnostics";
import {
  createProcessedVideoTrack,
  extractTrackConstraints,
  type OutgoingVideoTrackHandle
} from "../utils/videoPixelPipeline";
import type { VoicePeersRef } from "./voiceCallTypes";

type UseVoiceRuntimeMediaEffectsArgs = {
  localStreamRef: MutableRefObject<MediaStream | null>;
  peersRef: VoicePeersRef;
  roomVoiceConnected: boolean;
  allowVideoStreaming: boolean;
  videoStreamingEnabled: boolean;
  serverVideoEffectType: "none" | "pixel8" | "ascii";
  serverVideoPixelFxStrength: number;
  serverVideoPixelFxPixelSize: number;
  serverVideoPixelFxGridThickness: number;
  serverVideoAsciiCellSize: number;
  serverVideoAsciiContrast: number;
  serverVideoAsciiColor: string;
  selectedInputId: string;
  selectedVideoInputId: string;
  micMuted: boolean;
  audioMuted: boolean;
  outputVolume: number;
  getAudioConstraints: () => MediaTrackConstraints | boolean;
  getVideoConstraints: () => MediaTrackConstraints | false;
  setLocalVideoStream: (value: MediaStream | null) => void;
  applyRemoteAudioOutput: (element: HTMLAudioElement) => Promise<void>;
  retryRemoteAudioPlayback: (reason: string) => void;
  pushCallLog: (text: string) => void;
  pushToastThrottled: (key: string, message: string) => void;
  t: (key: string) => string;
};

export function useVoiceRuntimeMediaEffects({
  localStreamRef,
  peersRef,
  roomVoiceConnected,
  allowVideoStreaming,
  videoStreamingEnabled,
  serverVideoEffectType,
  serverVideoPixelFxStrength,
  serverVideoPixelFxPixelSize,
  serverVideoPixelFxGridThickness,
  serverVideoAsciiCellSize,
  serverVideoAsciiContrast,
  serverVideoAsciiColor,
  selectedInputId,
  selectedVideoInputId,
  micMuted,
  audioMuted,
  outputVolume,
  getAudioConstraints,
  getVideoConstraints,
  setLocalVideoStream,
  applyRemoteAudioOutput,
  retryRemoteAudioPlayback,
  pushCallLog,
  pushToastThrottled,
  t
}: UseVoiceRuntimeMediaEffectsArgs) {
  const mediaRecoveryInProgressRef = useRef(false);
  const outgoingVideoProcessorRef = useRef<OutgoingVideoTrackHandle | null>(null);

  useEffect(() => {
    if (!localStreamRef.current) {
      return;
    }

    localStreamRef.current.getAudioTracks().forEach((track) => {
      track.enabled = !micMuted;
    });
  }, [localStreamRef, micMuted]);

  useEffect(() => {
    peersRef.current.forEach((peer) => {
      void applyRemoteAudioOutput(peer.audioElement);
    });
  }, [peersRef, applyRemoteAudioOutput]);

  useEffect(() => {
    const gainValue = audioMuted ? 0 : Math.max(0, Math.min(1, outputVolume / 100));
    peersRef.current.forEach((peer) => {
      if (peer.speakingGain) {
        peer.speakingGain.gain.value = gainValue;
      }
      if (!audioMuted && peer.speakingAudioContext?.state === "suspended") {
        void peer.speakingAudioContext.resume().catch(() => {
          return;
        });
      }
    });
  }, [peersRef, audioMuted, outputVolume]);

  useEffect(() => {
    const handleUserGesture = () => {
      retryRemoteAudioPlayback("user-gesture");
    };

    window.addEventListener("pointerdown", handleUserGesture, { passive: true });
    window.addEventListener("touchstart", handleUserGesture, { passive: true });
    window.addEventListener("keydown", handleUserGesture);

    return () => {
      window.removeEventListener("pointerdown", handleUserGesture);
      window.removeEventListener("touchstart", handleUserGesture);
      window.removeEventListener("keydown", handleUserGesture);
    };
  }, [retryRemoteAudioPlayback]);

  useEffect(() => {
    const connections = Array.from(peersRef.current.values()).map((item) => item.connection);
    if (connections.length === 0 || !localStreamRef.current) {
      return;
    }

    let cancelled = false;

    const replaceAudioTrack = async () => {
      try {
        const nextStream = await navigator.mediaDevices.getUserMedia({
          audio: getAudioConstraints(),
          video: false
        });

        if (cancelled) {
          nextStream.getTracks().forEach((track) => track.stop());
          return;
        }

        const nextTrack = nextStream.getAudioTracks()[0];
        if (!nextTrack) {
          nextStream.getTracks().forEach((track) => track.stop());
          return;
        }

        nextTrack.enabled = !micMuted;

        await Promise.all(
          connections.map(async (connection) => {
            const sender = connection.getSenders().find((item) => item.track?.kind === "audio");
            if (sender) {
              await sender.replaceTrack(nextTrack);
            }
          })
        );

        const currentStream = localStreamRef.current;
        const videoTracks = currentStream?.getVideoTracks() || [];
        currentStream?.getAudioTracks().forEach((track) => track.stop());
        const mergedStream = new MediaStream([nextTrack, ...videoTracks]);
        localStreamRef.current = mergedStream;
        setLocalVideoStream(videoTracks.length > 0 ? mergedStream : null);
        pushCallLog("input device switched for active call");
        logVoiceDiagnostics("runtime input track replaced", {
          selectedInputId: selectedInputId || "default"
        });
      } catch (error) {
        if (!cancelled) {
          pushToastThrottled("devices-load-failed", t("settings.devicesLoadFailed"));
          pushCallLog(`input device switch failed: ${(error as Error).message}`);
        }
      }
    };

    void replaceAudioTrack();

    return () => {
      cancelled = true;
    };
  }, [peersRef, localStreamRef, selectedInputId, getAudioConstraints, micMuted, t, pushToastThrottled, pushCallLog, setLocalVideoStream]);

  useEffect(() => {
    if (!allowVideoStreaming || !localStreamRef.current) {
      return;
    }

    const connections = Array.from(peersRef.current.values()).map((item) => item.connection);
    let cancelled = false;

    const syncVideoTrack = async () => {
      const stream = localStreamRef.current;
      if (!stream) {
        return;
      }

      const currentVideoTracks = stream.getVideoTracks();

      if (!videoStreamingEnabled) {
        outgoingVideoProcessorRef.current?.stop();
        outgoingVideoProcessorRef.current = null;

        currentVideoTracks.forEach((track) => {
          stream.removeTrack(track);
          track.stop();
        });

        await Promise.all(
          connections.map(async (connection) => {
            const sender = connection.getSenders().find((item) => item.track?.kind === "video");
            if (sender) {
              await sender.replaceTrack(null);
            }
          })
        );

        setLocalVideoStream(null);
        return;
      }

      const videoOnlyStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: getVideoConstraints()
      });
      const nextRawVideoTrack = videoOnlyStream.getVideoTracks()[0];

      if (!nextRawVideoTrack) {
        videoOnlyStream.getTracks().forEach((track) => track.stop());
        return;
      }

      if (cancelled) {
        videoOnlyStream.getTracks().forEach((track) => track.stop());
        return;
      }

      outgoingVideoProcessorRef.current?.stop();
      outgoingVideoProcessorRef.current = null;

      const constraints = extractTrackConstraints(getVideoConstraints());
      const processedVideoHandle = serverVideoEffectType !== "none"
        ? createProcessedVideoTrack(nextRawVideoTrack, {
          width: constraints.width,
          height: constraints.height,
          fps: constraints.fps,
          effectType: serverVideoEffectType,
          strength: serverVideoPixelFxStrength,
          pixelSize: serverVideoPixelFxPixelSize,
          gridThickness: serverVideoPixelFxGridThickness,
          asciiCellSize: serverVideoAsciiCellSize,
          asciiContrast: serverVideoAsciiContrast,
          asciiColor: serverVideoAsciiColor
        })
        : null;

      const nextVideoTrack = processedVideoHandle?.track || nextRawVideoTrack;
      if (processedVideoHandle) {
        outgoingVideoProcessorRef.current = processedVideoHandle;
      }

      currentVideoTracks.forEach((track) => {
        stream.removeTrack(track);
        track.stop();
      });

      stream.addTrack(nextVideoTrack);

      await Promise.all(
        connections.map(async (connection) => {
          const sender = connection.getSenders().find((item) => item.track?.kind === "video");
          if (sender) {
            await sender.replaceTrack(nextVideoTrack);
            return;
          }

          connection.addTrack(nextVideoTrack, stream);
        })
      );

      setLocalVideoStream(stream);
    };

    void syncVideoTrack().catch((error) => {
      if (cancelled) {
        return;
      }
      pushCallLog(`camera sync failed: ${(error as Error).message}`);
    });

    return () => {
      cancelled = true;
    };
  }, [
    localStreamRef,
    peersRef,
    allowVideoStreaming,
    videoStreamingEnabled,
    serverVideoEffectType,
    serverVideoPixelFxStrength,
    serverVideoPixelFxPixelSize,
    serverVideoPixelFxGridThickness,
    serverVideoAsciiCellSize,
    serverVideoAsciiContrast,
    serverVideoAsciiColor,
    selectedVideoInputId,
    getVideoConstraints,
    setLocalVideoStream,
    pushCallLog
  ]);

  useEffect(() => {
    if (!roomVoiceConnected) {
      return;
    }

    const WATCHDOG_INTERVAL_MS = 5000;
    const STALL_TICKS_THRESHOLD = 3;
    let cancelled = false;
    const outboundStateBySender = new Map<string, { bytes: number; stalledTicks: number }>();

    const recoverLocalMedia = async (reason: string) => {
      if (mediaRecoveryInProgressRef.current) {
        return;
      }

      mediaRecoveryInProgressRef.current = true;

      try {
        const recoveredStream = await navigator.mediaDevices.getUserMedia({
          audio: getAudioConstraints(),
          video: getVideoConstraints()
        });

        if (cancelled) {
          recoveredStream.getTracks().forEach((track) => track.stop());
          return;
        }

        const nextAudioTrack = recoveredStream.getAudioTracks()[0] || null;
        const nextRawVideoTrack = recoveredStream.getVideoTracks()[0] || null;

        if (!nextAudioTrack) {
          recoveredStream.getTracks().forEach((track) => track.stop());
          throw new Error("audio track missing");
        }

        nextAudioTrack.enabled = !micMuted;

        outgoingVideoProcessorRef.current?.stop();
        outgoingVideoProcessorRef.current = null;

        const constraints = extractTrackConstraints(getVideoConstraints());
        const processedVideoHandle = nextRawVideoTrack && serverVideoEffectType !== "none"
          ? createProcessedVideoTrack(nextRawVideoTrack, {
            width: constraints.width,
            height: constraints.height,
            fps: constraints.fps,
            effectType: serverVideoEffectType,
            strength: serverVideoPixelFxStrength,
            pixelSize: serverVideoPixelFxPixelSize,
            gridThickness: serverVideoPixelFxGridThickness,
            asciiCellSize: serverVideoAsciiCellSize,
            asciiContrast: serverVideoAsciiContrast,
            asciiColor: serverVideoAsciiColor
          })
          : null;

        const nextVideoTrack = processedVideoHandle?.track || nextRawVideoTrack;
        if (processedVideoHandle) {
          outgoingVideoProcessorRef.current = processedVideoHandle;
        }

        const mergedTracks: MediaStreamTrack[] = [nextAudioTrack];
        if (nextVideoTrack && allowVideoStreaming && videoStreamingEnabled) {
          mergedTracks.push(nextVideoTrack);
        }
        const mergedStream = new MediaStream(mergedTracks);

        await Promise.all(
          Array.from(peersRef.current.values()).map(async ({ connection }) => {
            const audioSender = connection.getSenders().find((item) => item.track?.kind === "audio");
            if (audioSender) {
              await audioSender.replaceTrack(nextAudioTrack);
            } else {
              connection.addTrack(nextAudioTrack, mergedStream);
            }

            const videoSender = connection.getSenders().find((item) => item.track?.kind === "video");
            if (videoSender) {
              await videoSender.replaceTrack(nextVideoTrack && videoStreamingEnabled ? nextVideoTrack : null);
            } else if (nextVideoTrack && allowVideoStreaming && videoStreamingEnabled) {
              connection.addTrack(nextVideoTrack, mergedStream);
            }
          })
        );

        localStreamRef.current?.getTracks().forEach((track) => track.stop());
        localStreamRef.current = mergedStream;
        setLocalVideoStream(nextVideoTrack && allowVideoStreaming && videoStreamingEnabled ? mergedStream : null);
        outboundStateBySender.clear();
        pushCallLog(`local media recovered by watchdog (${reason})`);
      } catch (error) {
        if (!cancelled) {
          pushToastThrottled("media-watchdog-recover-failed", t("settings.devicesLoadFailed"));
          pushCallLog(`local media recovery failed (${reason}): ${(error as Error).message}`);
        }
      } finally {
        mediaRecoveryInProgressRef.current = false;
      }
    };

    const checkOutboundFlow = async (): Promise<string | null> => {
      for (const [peerUserId, peer] of peersRef.current.entries()) {
        if (peer.connection.connectionState !== "connected") {
          continue;
        }

        const senders = peer.connection.getSenders();
        const kinds: Array<"audio" | "video"> = ["audio", "video"];

        for (const kind of kinds) {
          if (kind === "video" && (!allowVideoStreaming || !videoStreamingEnabled)) {
            outboundStateBySender.delete(`${peerUserId}:video`);
            continue;
          }

          if (kind === "audio" && micMuted) {
            outboundStateBySender.delete(`${peerUserId}:audio`);
            continue;
          }

          const sender = senders.find((item) => item.track?.kind === kind);
          if (!sender?.track || sender.track.readyState !== "live") {
            return `${kind}-sender-missing`;
          }

          try {
            const stats = await sender.getStats();
            let bytesSent = -1;
            stats.forEach((report) => {
              if (report.type === "outbound-rtp" && !(report as { isRemote?: boolean }).isRemote) {
                const bytes = (report as { bytesSent?: number }).bytesSent;
                if (typeof bytes === "number") {
                  bytesSent = Math.max(bytesSent, bytes);
                }
              }
            });

            if (bytesSent < 0) {
              continue;
            }

            const key = `${peerUserId}:${kind}`;
            const previous = outboundStateBySender.get(key);

            if (!previous || bytesSent > previous.bytes) {
              outboundStateBySender.set(key, { bytes: bytesSent, stalledTicks: 0 });
              continue;
            }

            const nextStalledTicks = previous.stalledTicks + 1;
            outboundStateBySender.set(key, {
              bytes: bytesSent,
              stalledTicks: nextStalledTicks
            });

            if (nextStalledTicks >= STALL_TICKS_THRESHOLD) {
              return `${kind}-outbound-stalled`;
            }
          } catch {
            continue;
          }
        }
      }

      return null;
    };

    const runWatchdogTick = async () => {
      if (cancelled) {
        return;
      }

      const stream = localStreamRef.current;
      if (!stream) {
        return;
      }

      const audioTrack = stream.getAudioTracks()[0] || null;
      if (!audioTrack || audioTrack.readyState !== "live") {
        await recoverLocalMedia("audio-track-ended");
        return;
      }

      if (allowVideoStreaming && videoStreamingEnabled) {
        const videoTrack = stream.getVideoTracks()[0] || null;
        if (!videoTrack || videoTrack.readyState !== "live") {
          await recoverLocalMedia("video-track-ended");
          return;
        }
      }

      const outboundIssue = await checkOutboundFlow();
      if (outboundIssue) {
        await recoverLocalMedia(outboundIssue);
      }
    };

    const timerId = window.setInterval(() => {
      void runWatchdogTick();
    }, WATCHDOG_INTERVAL_MS);

    void runWatchdogTick();

    return () => {
      cancelled = true;
      window.clearInterval(timerId);
      outgoingVideoProcessorRef.current?.stop();
      outgoingVideoProcessorRef.current = null;
    };
  }, [
    roomVoiceConnected,
    localStreamRef,
    peersRef,
    allowVideoStreaming,
    videoStreamingEnabled,
    serverVideoEffectType,
    serverVideoPixelFxStrength,
    serverVideoPixelFxPixelSize,
    serverVideoPixelFxGridThickness,
    serverVideoAsciiCellSize,
    serverVideoAsciiContrast,
    serverVideoAsciiColor,
    micMuted,
    getAudioConstraints,
    getVideoConstraints,
    setLocalVideoStream,
    pushCallLog,
    pushToastThrottled,
    t
  ]);
}
