/// this component is for rendering draggable/resizable video windows for local and remote video streams, as an overlay on top of the main app UI. It is used in the "call" page when the user has enabled the "floating video windows" setting. The component is designed to be self-contained and not rely on any external state or context, other than the props passed to it. The parent component is responsible for managing the state of the video streams and camera enabled flags, as well as the visibility of the overlay.

import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { asTrimmedString } from "../utils/stringUtils";

type VideoWindowsOverlayProps = {
  t: (key: string) => string;
  currentUserId: string;
  localUserLabel: string;
  localCameraEnabled: boolean;
  localVideoStream: MediaStream | null;
  remoteVideoStreamsByUserId: Record<string, MediaStream>;
  remoteCameraEnabledByUserId: Record<string, boolean>;
  remoteLabelsByUserId: Record<string, string>;
  screenShareStream: MediaStream | null;
  screenShareOwnerLabel: string;
  screenShareOwnerUserId: string;
  screenShareActive: boolean;
  minWidth: number;
  maxWidth: number;
  visible: boolean;
  speakingWindowIds: string[];
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
  stream: MediaStream | null;
  muted: boolean;
  isScreenShare?: boolean;
};

const TILE_GAP = 12;
const VIEWPORT_GUTTER = 12;
const DEFAULT_Y = 76;
const ASPECT_RATIO = 4 / 3;
const VIDEO_LAYOUTS_STORAGE_KEY = "datowave_video_windows_layouts_v2";

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function defaultLayout(index: number, minWidth: number, maxWidth: number): TileLayout {
  const width = clamp(140, minWidth, maxWidth);
  const height = width / ASPECT_RATIO;
  const maxX = Math.max(VIEWPORT_GUTTER, window.innerWidth - width - VIEWPORT_GUTTER);
  const centeredX = clamp(Math.round((window.innerWidth - width) / 2), VIEWPORT_GUTTER, maxX);
  return {
    x: centeredX,
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
  isScreenShare,
  layout,
  zIndex,
  onDragStart,
  onResizeStart,
  onOpenScreenFullscreen
}: {
  id: string;
  label: string;
  stream: MediaStream | null;
  muted: boolean;
  mirrored: boolean;
  isScreenShare?: boolean;
  layout: TileLayout;
  zIndex: number;
  onDragStart: (id: string, event: ReactPointerEvent<HTMLDivElement>) => void;
  onResizeStart: (id: string, corner: ResizeCorner, event: ReactPointerEvent<HTMLButtonElement>) => void;
  onOpenScreenFullscreen?: (payload: { id: string; label: string; stream: MediaStream | null; mirrored?: boolean }) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) {
      return;
    }

    if (!stream) {
      if (element.srcObject) {
        element.srcObject = null;
      }
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
        transform: `translate(${layout.x}px, ${layout.y}px)`,
        zIndex
      }}
    >
      <div className="video-window-header">
        <span className="video-window-label">{label}</span>
        {isScreenShare ? (
          <button
            type="button"
            className="secondary icon-btn tiny video-window-fullscreen-btn"
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.stopPropagation();
              onOpenScreenFullscreen?.({
                id,
                label,
                stream,
                mirrored
              });
            }}
            aria-label="Open fullscreen"
          >
            <i className="bi bi-arrows-fullscreen" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {stream ? (
        <video
          ref={videoRef}
          className="video-window-media"
          style={mirrored ? { transform: "scaleX(-1)" } : undefined}
          autoPlay
          playsInline
          muted={muted}
        />
      ) : (
        <div className="video-window-media" style={{ display: "grid", placeItems: "center", fontSize: "12px", opacity: 0.8 }}>
          Waiting for stream
        </div>
      )}
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
  currentUserId,
  localUserLabel,
  localCameraEnabled,
  localVideoStream,
  remoteVideoStreamsByUserId,
  remoteCameraEnabledByUserId,
  remoteLabelsByUserId,
  screenShareStream,
  screenShareOwnerLabel,
  screenShareOwnerUserId,
  screenShareActive,
  minWidth,
  maxWidth,
  visible,
  speakingWindowIds
}: VideoWindowsOverlayProps) {
  const effectiveMinWidth = Math.max(80, Math.min(480, Math.round(minWidth)));
  const effectiveMaxWidth = Math.max(effectiveMinWidth, Math.min(480, Math.round(maxWidth)));

  const items = useMemo<TileItem[]>(() => {
    const next: TileItem[] = [];
      const normalizedCurrentUserId = asTrimmedString(currentUserId);

      if (localCameraEnabled) {
      next.push({
        id: "local",
        label: localUserLabel || t("video.you"),
        stream: localVideoStream,
        muted: true
      });
    }

    Object.entries(remoteCameraEnabledByUserId).forEach(([userId, enabled]) => {
      if (!enabled || userId === "local" || (normalizedCurrentUserId && userId === normalizedCurrentUserId)) {
        return;
      }

      next.push({
        id: userId,
        label: remoteLabelsByUserId[userId] || userId,
        stream: remoteVideoStreamsByUserId[userId] || null,
        muted: false
      });
    });

    if (screenShareActive) {
      next.push({
        id: `screen-share:${screenShareOwnerUserId || "unknown"}`,
        label: `${screenShareOwnerLabel || "Screen"} - Screen`,
        stream: screenShareStream,
        muted: true,
        isScreenShare: true
      });
    }

    return next;
  }, [
    currentUserId,
    localCameraEnabled,
    localVideoStream,
    localUserLabel,
    remoteCameraEnabledByUserId,
    remoteLabelsByUserId,
    remoteVideoStreamsByUserId,
    screenShareActive,
    screenShareOwnerLabel,
    screenShareOwnerUserId,
    screenShareStream,
    t
  ]);

  const [fullscreenScreenShare, setFullscreenScreenShare] = useState<{
    id: string;
    label: string;
    stream: MediaStream | null;
    mirrored?: boolean;
  } | null>(null);
  const [fullscreenResolution, setFullscreenResolution] = useState("");

  const [layoutsById, setLayoutsById] = useState<Record<string, TileLayout>>({});
  const [zOrderById, setZOrderById] = useState<Record<string, number>>({});
  const zOrderCounterRef = useRef(0);
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

  const speakingIdSet = useMemo(() => {
    const next = new Set<string>();
    speakingWindowIds.forEach((id) => {
      const normalized = asTrimmedString(id);
      if (normalized) {
        next.add(normalized);
      }
    });
    return next;
  }, [speakingWindowIds]);

  const updateFullscreenResolution = (element: HTMLVideoElement | null) => {
    if (!element) {
      return;
    }

    const width = Number(element.videoWidth || 0);
    const height = Number(element.videoHeight || 0);
    if (width > 0 && height > 0) {
      setFullscreenResolution(`${width}x${height}`);
      return;
    }

    setFullscreenResolution("");
  };

  useEffect(() => {
    if (fullscreenScreenShare) {
      return;
    }

    setFullscreenResolution("");
  }, [fullscreenScreenShare]);

  // Bug 3 fix: a new screen-share session must always start in the floating
  // window mode, never auto-open in fullscreen. If the previously fullscreened
  // stream ends, or a different user starts streaming, dismiss fullscreen.
  useEffect(() => {
    if (!fullscreenScreenShare) {
      return;
    }
    const currentScreenShareId = screenShareActive
      ? `screen-share:${screenShareOwnerUserId || "unknown"}`
      : null;
    if (currentScreenShareId !== fullscreenScreenShare.id) {
      setFullscreenScreenShare(null);
    }
  }, [fullscreenScreenShare, screenShareActive, screenShareOwnerUserId]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(VIDEO_LAYOUTS_STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as Record<string, { x?: number; y?: number; width?: number }>;
      if (!parsed || typeof parsed !== "object") {
        return;
      }
      const restored: Record<string, TileLayout> = {};
      Object.entries(parsed).forEach(([id, layout]) => {
        const width = Number(layout?.width);
        const x = Number(layout?.x);
        const y = Number(layout?.y);
        if (!Number.isFinite(width) || !Number.isFinite(x) || !Number.isFinite(y)) {
          return;
        }
        restored[id] = {
          width,
          x,
          y
        };
      });
      setLayoutsById(restored);
    } catch {
      return;
    }
  }, []);

  useEffect(() => {
    setLayoutsById((prev) => {
      const next: Record<string, TileLayout> = { ...prev };
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
    try {
      localStorage.setItem(VIDEO_LAYOUTS_STORAGE_KEY, JSON.stringify(layoutsById));
    } catch {
      return;
    }
  }, [layoutsById]);

  useEffect(() => {
    const handleResize = () => {
      setLayoutsById((prev) => {
        const next: Record<string, TileLayout> = {};
        Object.entries(prev).forEach(([id, layout]) => {
          const nextWidth = clamp(layout.width, effectiveMinWidth, effectiveMaxWidth);
          const nextHeight = nextWidth / ASPECT_RATIO;
          const maxX = Math.max(VIEWPORT_GUTTER, window.innerWidth - nextWidth - VIEWPORT_GUTTER);
          const maxY = Math.max(VIEWPORT_GUTTER, window.innerHeight - nextHeight - VIEWPORT_GUTTER);
          next[id] = {
            width: nextWidth,
            x: clamp(layout.x, VIEWPORT_GUTTER, maxX),
            y: clamp(layout.y, VIEWPORT_GUTTER, maxY)
          };
        });
        return next;
      });
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [effectiveMinWidth, effectiveMaxWidth]);

  useEffect(() => {
    setZOrderById((prev) => {
      const next: Record<string, number> = {};
      let nextCounter = zOrderCounterRef.current;

      items.forEach((item, index) => {
        const existing = prev[item.id];
        if (typeof existing === "number") {
          next[item.id] = existing;
          nextCounter = Math.max(nextCounter, existing);
          return;
        }

        nextCounter += 1;
        // Keep deterministic initial order for newly appeared windows.
        next[item.id] = nextCounter + index;
      });

      zOrderCounterRef.current = nextCounter + items.length;
      return next;
    });
  }, [items]);

  const bringToFront = (id: string) => {
    zOrderCounterRef.current += 1;
    const nextOrder = zOrderCounterRef.current;
    setZOrderById((prev) => ({
      ...prev,
      [id]: nextOrder
    }));
  };

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
    <div
      className="video-windows-overlay"
      aria-label={t("video.overlayAria") }
      style={fullscreenScreenShare ? { pointerEvents: "auto" } : undefined}
    >
      {items.map((item) => {
        if (fullscreenScreenShare && item.isScreenShare) {
          return null;
        }

        return (
        <VideoTile
          key={item.id}
          id={item.id}
          label={item.label}
          stream={item.stream}
          muted={item.muted}
          mirrored={item.id === "local"}
          isScreenShare={item.isScreenShare}
          layout={layoutsById[item.id] || defaultLayout(0, effectiveMinWidth, effectiveMaxWidth)}
          zIndex={(speakingIdSet.has(item.id) ? 2000 : 1000) + (zOrderById[item.id] || 0)}
          onDragStart={(id, event) => {
            const target = event.target as HTMLElement;
            if (target.closest(".video-window-resize")) {
              return;
            }
            const layout = layoutsById[id] || defaultLayout(0, effectiveMinWidth, effectiveMaxWidth);
            bringToFront(id);
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
            bringToFront(id);
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
          onOpenScreenFullscreen={(payload) => {
            setFullscreenScreenShare(payload);
          }}
        />
        );
      })}

      {fullscreenScreenShare ? (
        <div
          className="chat-image-modal-overlay video-screen-fullscreen-overlay"
          onClick={() => setFullscreenScreenShare(null)}
          role="presentation"
        >
          <div className="chat-image-modal-panel video-screen-fullscreen-panel" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="secondary icon-btn chat-image-modal-close video-screen-fullscreen-close"
              onClick={() => setFullscreenScreenShare(null)}
              aria-label="Close fullscreen"
            >
              <i className="bi bi-x-lg" aria-hidden="true" />
            </button>
            {fullscreenResolution ? (
              <div className="video-screen-fullscreen-resolution">{fullscreenResolution}</div>
            ) : null}
            <video
              autoPlay
              playsInline
              muted
              className="chat-image-modal-media video-screen-fullscreen-media"
              onLoadedMetadata={(event) => updateFullscreenResolution(event.currentTarget)}
              onResize={(event) => updateFullscreenResolution(event.currentTarget)}
              ref={(element) => {
                if (!element) {
                  return;
                }
                if (element.srcObject !== fullscreenScreenShare.stream) {
                  element.srcObject = fullscreenScreenShare.stream;
                  void element.play().catch(() => undefined);
                }
                updateFullscreenResolution(element);
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
