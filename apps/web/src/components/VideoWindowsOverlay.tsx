import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

type VideoWindowsOverlayProps = {
  t: (key: string) => string;
  localUserLabel: string;
  localVideoStream: MediaStream | null;
  remoteVideoStreamsByUserId: Record<string, MediaStream>;
  remoteLabelsByUserId: Record<string, string>;
  pixelFxEnabled: boolean;
  visible: boolean;
};

type TileLayout = {
  x: number;
  y: number;
  width: number;
};

type TileItem = {
  id: string;
  label: string;
  stream: MediaStream;
  muted: boolean;
};

const MIN_WIDTH = 100;
const MAX_WIDTH = 200;
const TILE_GAP = 12;
const VIEWPORT_GUTTER = 12;
const DEFAULT_Y = 76;
const ASPECT_RATIO = 4 / 3;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function defaultLayout(index: number): TileLayout {
  const width = 140;
  const height = width / ASPECT_RATIO;
  return {
    x: Math.max(VIEWPORT_GUTTER, window.innerWidth - width - VIEWPORT_GUTTER),
    y: DEFAULT_Y + index * (height + TILE_GAP),
    width
  };
}

function VideoTile({
  id,
  label,
  stream,
  muted,
  pixelFxEnabled,
  layout,
  onDragStart,
  onResizeStart
}: {
  id: string;
  label: string;
  stream: MediaStream;
  muted: boolean;
  pixelFxEnabled: boolean;
  layout: TileLayout;
  onDragStart: (id: string, event: ReactPointerEvent<HTMLDivElement>) => void;
  onResizeStart: (id: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) {
      return;
    }

    const videoOnlyStream = new MediaStream(stream.getVideoTracks());
    if (element.srcObject !== videoOnlyStream) {
      element.srcObject = videoOnlyStream;
      void element.play().catch(() => {
        return;
      });
    }
  }, [stream]);

  const height = Math.round(layout.width / ASPECT_RATIO);

  return (
    <div
      className="video-window"
      style={{
        width: `${layout.width}px`,
        height: `${height}px`,
        transform: `translate(${layout.x}px, ${layout.y}px)`
      }}
    >
      <div className="video-window-header" onPointerDown={(event) => onDragStart(id, event)}>
        <span className="video-window-label">{label}</span>
      </div>
      <video
        ref={videoRef}
        className={`video-window-media ${pixelFxEnabled ? "video-window-media-pixelfx" : ""}`}
        width={pixelFxEnabled ? 96 : undefined}
        height={pixelFxEnabled ? 72 : undefined}
        autoPlay
        playsInline
        muted={muted}
      />
      <button
        type="button"
        className="video-window-resize"
        onPointerDown={(event) => onResizeStart(id, event)}
        aria-label="Resize video window"
      />
    </div>
  );
}

export function VideoWindowsOverlay({
  t,
  localUserLabel,
  localVideoStream,
  remoteVideoStreamsByUserId,
  remoteLabelsByUserId,
  pixelFxEnabled,
  visible
}: VideoWindowsOverlayProps) {
  const items = useMemo<TileItem[]>(() => {
    const next: TileItem[] = [];

    if (localVideoStream) {
      next.push({
        id: "local",
        label: localUserLabel || t("video.you"),
        stream: localVideoStream,
        muted: true
      });
    }

    Object.entries(remoteVideoStreamsByUserId).forEach(([userId, stream]) => {
      next.push({
        id: userId,
        label: remoteLabelsByUserId[userId] || userId,
        stream,
        muted: false
      });
    });

    return next;
  }, [localVideoStream, localUserLabel, remoteLabelsByUserId, remoteVideoStreamsByUserId, t]);

  const [layoutsById, setLayoutsById] = useState<Record<string, TileLayout>>({});
  const dragStateRef = useRef<
    | {
      id: string;
      mode: "drag" | "resize";
      pointerId: number;
      startX: number;
      startY: number;
      startLayout: TileLayout;
    }
    | null
  >(null);

  useEffect(() => {
    setLayoutsById((prev) => {
      const next: Record<string, TileLayout> = {};
      items.forEach((item, index) => {
        next[item.id] = prev[item.id] || defaultLayout(index);
      });
      return next;
    });
  }, [items]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const state = dragStateRef.current;
      if (!state) {
        return;
      }

      const deltaX = event.clientX - state.startX;
      const deltaY = event.clientY - state.startY;

      setLayoutsById((prev) => {
        const current = prev[state.id] || state.startLayout;
        const height = current.width / ASPECT_RATIO;

        if (state.mode === "drag") {
          const maxX = Math.max(VIEWPORT_GUTTER, window.innerWidth - current.width - VIEWPORT_GUTTER);
          const maxY = Math.max(VIEWPORT_GUTTER, window.innerHeight - height - VIEWPORT_GUTTER);
          return {
            ...prev,
            [state.id]: {
              ...current,
              x: clamp(state.startLayout.x + deltaX, VIEWPORT_GUTTER, maxX),
              y: clamp(state.startLayout.y + deltaY, VIEWPORT_GUTTER, maxY)
            }
          };
        }

        const nextWidth = clamp(state.startLayout.width + deltaX, MIN_WIDTH, MAX_WIDTH);
        const nextHeight = nextWidth / ASPECT_RATIO;
        const maxX = Math.max(VIEWPORT_GUTTER, window.innerWidth - nextWidth - VIEWPORT_GUTTER);
        const maxY = Math.max(VIEWPORT_GUTTER, window.innerHeight - nextHeight - VIEWPORT_GUTTER);

        return {
          ...prev,
          [state.id]: {
            x: clamp(current.x, VIEWPORT_GUTTER, maxX),
            y: clamp(current.y, VIEWPORT_GUTTER, maxY),
            width: nextWidth
          }
        };
      });
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (!dragStateRef.current || dragStateRef.current.pointerId !== event.pointerId) {
        return;
      }
      dragStateRef.current = null;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, []);

  if (!visible || items.length === 0) {
    return null;
  }

  return (
    <div className="video-windows-overlay" aria-label={t("video.overlayAria") }>
      {items.map((item) => (
        <VideoTile
          key={item.id}
          id={item.id}
          label={item.label}
          stream={item.stream}
          muted
          pixelFxEnabled={pixelFxEnabled}
          layout={layoutsById[item.id] || defaultLayout(0)}
          onDragStart={(id, event) => {
            const layout = layoutsById[id] || defaultLayout(0);
            dragStateRef.current = {
              id,
              mode: "drag",
              pointerId: event.pointerId,
              startX: event.clientX,
              startY: event.clientY,
              startLayout: layout
            };
            event.preventDefault();
          }}
          onResizeStart={(id, event) => {
            const layout = layoutsById[id] || defaultLayout(0);
            dragStateRef.current = {
              id,
              mode: "resize",
              pointerId: event.pointerId,
              startX: event.clientX,
              startY: event.clientY,
              startLayout: layout
            };
            event.preventDefault();
          }}
        />
      ))}
    </div>
  );
}
