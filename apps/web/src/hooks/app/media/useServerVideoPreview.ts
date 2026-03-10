import { useEffect, useRef, useState } from "react";
import type { AppServerMenuTab } from "../state/useAppUiState";
import type { ServerVideoEffectType } from "../../../hooks/rtc/voiceCallTypes";
import { createProcessedVideoTrack, type OutgoingVideoTrackHandle } from "../../../utils/videoPixelPipeline";

type UseServerVideoPreviewArgs = {
  appMenuOpen: boolean;
  serverMenuTab: AppServerMenuTab;
  canManageAudioQuality: boolean;
  selectedVideoInputId: string;
  serverVideoResolution: string;
  serverVideoFps: 10 | 15 | 24 | 30;
  serverVideoEffectType: ServerVideoEffectType;
  serverVideoPixelFxStrength: number;
  serverVideoPixelFxPixelSize: number;
  serverVideoPixelFxGridThickness: number;
  serverVideoAsciiCellSize: number;
  serverVideoAsciiContrast: number;
  serverVideoAsciiColor: string;
};

export function useServerVideoPreview({
  appMenuOpen,
  serverMenuTab,
  canManageAudioQuality,
  selectedVideoInputId,
  serverVideoResolution,
  serverVideoFps,
  serverVideoEffectType,
  serverVideoPixelFxStrength,
  serverVideoPixelFxPixelSize,
  serverVideoPixelFxGridThickness,
  serverVideoAsciiCellSize,
  serverVideoAsciiContrast,
  serverVideoAsciiColor
}: UseServerVideoPreviewArgs) {
  const [serverVideoPreviewStream, setServerVideoPreviewStream] = useState<MediaStream | null>(null);
  const serverVideoPreviewHandleRef = useRef<OutgoingVideoTrackHandle | null>(null);
  const serverVideoPreviewRawTrackRef = useRef<MediaStreamTrack | null>(null);

  useEffect(() => {
    const stopServerVideoPreview = () => {
      serverVideoPreviewHandleRef.current?.stop();
      serverVideoPreviewHandleRef.current = null;
      serverVideoPreviewRawTrackRef.current?.stop();
      serverVideoPreviewRawTrackRef.current = null;
      setServerVideoPreviewStream(null);
    };

    const shouldPreviewVideo = appMenuOpen && serverMenuTab === "video" && canManageAudioQuality;
    if (!shouldPreviewVideo || !navigator.mediaDevices?.getUserMedia) {
      stopServerVideoPreview();
      return;
    }

    let cancelled = false;
    stopServerVideoPreview();

    const [widthRaw, heightRaw] = serverVideoResolution.split("x");
    const width = Math.max(1, Number(widthRaw) || 320);
    const height = Math.max(1, Number(heightRaw) || 240);

    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            width: { ideal: width },
            height: { ideal: height },
            frameRate: { ideal: serverVideoFps },
            ...(selectedVideoInputId && selectedVideoInputId !== "default"
              ? { deviceId: { exact: selectedVideoInputId } }
              : {})
          }
        });
        const sourceTrack = stream.getVideoTracks()[0];
        stream.getAudioTracks().forEach((track) => track.stop());

        if (!sourceTrack) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        if (cancelled) {
          sourceTrack.stop();
          return;
        }

        if (serverVideoEffectType === "none") {
          serverVideoPreviewRawTrackRef.current = sourceTrack;
          setServerVideoPreviewStream(new MediaStream([sourceTrack]));
          return;
        }

        const processedHandle = createProcessedVideoTrack(sourceTrack, {
          width,
          height,
          fps: serverVideoFps,
          effectType: serverVideoEffectType,
          strength: serverVideoPixelFxStrength,
          pixelSize: serverVideoPixelFxPixelSize,
          gridThickness: serverVideoPixelFxGridThickness,
          asciiCellSize: serverVideoAsciiCellSize,
          asciiContrast: serverVideoAsciiContrast,
          asciiColor: serverVideoAsciiColor
        });

        if (!processedHandle) {
          setServerVideoPreviewStream(null);
          return;
        }

        if (cancelled) {
          processedHandle.stop();
          return;
        }

        serverVideoPreviewHandleRef.current = processedHandle;
        setServerVideoPreviewStream(new MediaStream([processedHandle.track]));
      } catch {
        if (!cancelled) {
          setServerVideoPreviewStream(null);
        }
      }
    })();

    return () => {
      cancelled = true;
      stopServerVideoPreview();
    };
  }, [
    appMenuOpen,
    serverMenuTab,
    canManageAudioQuality,
    selectedVideoInputId,
    serverVideoResolution,
    serverVideoFps,
    serverVideoEffectType,
    serverVideoPixelFxStrength,
    serverVideoPixelFxPixelSize,
    serverVideoPixelFxGridThickness,
    serverVideoAsciiCellSize,
    serverVideoAsciiContrast,
    serverVideoAsciiColor
  ]);

  return serverVideoPreviewStream;
}
