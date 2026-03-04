import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

type VideoWindowsOverlayProps = {
  t: (key: string) => string;
  localUserLabel: string;
  localVideoStream: MediaStream | null;
  remoteVideoStreamsByUserId: Record<string, MediaStream>;
  remoteLabelsByUserId: Record<string, string>;
  minWidth: number;
  maxWidth: number;
  visible: boolean;
};

type TileLayout = {
  x: number;
  y: number;
  width: number;
};

type ResizeCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

type TileItem = {
  id: string;
  label: string;
  stream: MediaStream;
  muted: boolean;
};

const TILE_GAP = 12;
const VIEWPORT_GUTTER = 12;
const DEFAULT_Y = 76;
const ASPECT_RATIO = 4 / 3;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function defaultLayout(index: number, minWidth: number, maxWidth: number): TileLayout {
  const width = clamp(140, minWidth, maxWidth);
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
  mirrored,
  layout,
  onDragStart,
  onResizeStart
}: {
  id: string;
  label: string;
  stream: MediaStream;
  muted: boolean;
  mirrored: boolean;
  layout: TileLayout;
  onDragStart: (id: string, event: ReactPointerEvent<HTMLDivElement>) => void;
  onResizeStart: (id: string, corner: ResizeCorner, event: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) {
      return;
    }

    if (element.srcObject !== stream) {
      element.srcObject = stream;
      void element.play().catch(() => {
        return;
      });
    }
  }, [stream]);

  const height = Math.round(layout.width / ASPECT_RATIO);

  return (
    <div
      className="video-window"
      onPointerDown={(event) => onDragStart(id, event)}
      style={{
        width: `${layout.width}px`,
        height: `${height}px`,
        transform: `translate(${layout.x}px, ${layout.y}px)`
      }}
    >
      <div className="video-window-header">
        <span className="video-window-label">{label}</span>
      </div>
      <video
        ref={videoRef}
        className="video-window-media"
        style={mirrored ? { transform: "scaleX(-1)" } : undefined}
        autoPlay
        playsInline
        muted={muted}
      />
      <button
        type="button"
        className="video-window-resize video-window-resize-top-left"
        onPointerDown={(event) => onResizeStart(id, "top-left", event)}
        aria-label="Resize video window from top left"
      />
      <button
        type="button"
        className="video-window-resize video-window-resize-top-right"
        onPointerDown={(event) => onResizeStart(id, "top-right", event)}
        aria-label="Resize video window from top right"
      />
      <button
        type="button"
        className="video-window-resize video-window-resize-bottom-left"
        onPointerDown={(event) => onResizeStart(id, "bottom-left", event)}
        aria-label="Resize video window from bottom left"
      />
      <button
        type="button"
        className="video-window-resize video-window-resize-bottom-right"
        onPointerDown={(event) => onResizeStart(id, "bottom-right", event)}
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
  minWidth,
  maxWidth,
  visible
}: VideoWindowsOverlayProps) {
  const effectiveMinWidth = Math.max(80, Math.min(480, Math.round(minWidth)));
  const effectiveMaxWidth = Math.max(effectiveMinWidth, Math.min(480, Math.round(maxWidth)));

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
      corner?: ResizeCorner;
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
        next[item.id] = prev[item.id]
          ? {
            ...prev[item.id],
            width: clamp(prev[item.id].width, effectiveMinWidth, effectiveMaxWidth)
          }
          : defaultLayout(index, effectiveMinWidth, effectiveMaxWidth);
      });
      return next;
    });
  }, [items, effectiveMinWidth, effectiveMaxWidth]);

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

        const growsFromLeft = state.corner === "top-left" || state.corner === "bottom-left";
        const growsFromTop = state.corner === "top-left" || state.corner === "top-right";
        const rawWidth = growsFromLeft
          ? state.startLayout.width - deltaX
          : state.startLayout.width + deltaX;
        const nextWidth = clamp(rawWidth, effectiveMinWidth, effectiveMaxWidth);
        const nextHeight = nextWidth / ASPECT_RATIO;
        const widthDelta = state.startLayout.width - nextWidth;
        const heightDelta = state.startLayout.width / ASPECT_RATIO - nextHeight;
        const nextXBase = growsFromLeft ? state.startLayout.x + widthDelta : state.startLayout.x;
        const nextYBase = growsFromTop ? state.startLayout.y + heightDelta : state.startLayout.y;
        const maxX = Math.max(VIEWPORT_GUTTER, window.innerWidth - nextWidth - VIEWPORT_GUTTER);
        const maxY = Math.max(VIEWPORT_GUTTER, window.innerHeight - nextHeight - VIEWPORT_GUTTER);

        return {
          ...prev,
          [state.id]: {
            x: clamp(nextXBase, VIEWPORT_GUTTER, maxX),
            y: clamp(nextYBase, VIEWPORT_GUTTER, maxY),
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
  }, [effectiveMinWidth, effectiveMaxWidth]);

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
          muted={item.muted}
          mirrored={item.id === "local"}
          layout={layoutsById[item.id] || defaultLayout(0, effectiveMinWidth, effectiveMaxWidth)}
          onDragStart={(id, event) => {
            const target = event.target as HTMLElement;
            if (target.closest(".video-window-resize")) {
              return;
            }
            const layout = layoutsById[id] || defaultLayout(0, effectiveMinWidth, effectiveMaxWidth);
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
          onResizeStart={(id, corner, event) => {
            const layout = layoutsById[id] || defaultLayout(0, effectiveMinWidth, effectiveMaxWidth);
            dragStateRef.current = {
              id,
              mode: "resize",
              corner,
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
