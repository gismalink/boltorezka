import { ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type PopupPlacement = "bottom-end" | "bottom-start" | "top-end" | "top-start";
type SidePopupPlacement = "right-start" | "right-end" | "left-start" | "left-end";
type AnyPopupPlacement = PopupPlacement | SidePopupPlacement;

type PopupPortalProps = {
  open: boolean;
  anchorRef: { current: HTMLElement | null };
  className?: string;
  placement?: AnyPopupPlacement;
  offset?: number;
  children: ReactNode;
};

type PositionState = {
  left: number;
  top: number;
};

const VIEWPORT_MARGIN = 8;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function PopupPortal({
  open,
  anchorRef,
  className = "",
  placement = "bottom-end",
  offset = 6,
  children
}: PopupPortalProps) {
  const root = useMemo(() => {
    if (typeof document === "undefined") {
      return null;
    }

    let node = document.getElementById("popup-root");
    if (!node) {
      node = document.createElement("div");
      node.id = "popup-root";
      document.body.appendChild(node);
    }

    return node;
  }, []);

  const popupRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<PositionState>({ left: -9999, top: -9999 });

  const updatePosition = () => {
    const anchor = anchorRef.current;
    const popup = popupRef.current;
    if (!anchor || !popup) {
      return;
    }

    const anchorRect = anchor.getBoundingClientRect();
    const popupRect = popup.getBoundingClientRect();

    const isSidePlacement = placement.startsWith("left") || placement.startsWith("right");
    let vertical: "top" | "bottom" = placement.includes("top") ? "top" : "bottom";
    let horizontal: "start" | "end" = placement.endsWith("start") ? "start" : "end";
    let side: "left" | "right" = placement.startsWith("left") ? "left" : "right";

    const hasRoomBelow = anchorRect.bottom + offset + popupRect.height <= window.innerHeight - VIEWPORT_MARGIN;
    const hasRoomAbove = anchorRect.top - offset - popupRect.height >= VIEWPORT_MARGIN;
    const hasRoomRight = anchorRect.right + offset + popupRect.width <= window.innerWidth - VIEWPORT_MARGIN;
    const hasRoomLeft = anchorRect.left - offset - popupRect.width >= VIEWPORT_MARGIN;

    let top = 0;
    let left = 0;

    if (isSidePlacement) {
      if (side === "right" && !hasRoomRight && hasRoomLeft) {
        side = "left";
      } else if (side === "left" && !hasRoomLeft && hasRoomRight) {
        side = "right";
      }

      left = side === "right"
        ? anchorRect.right + offset
        : anchorRect.left - offset - popupRect.width;

      top = horizontal === "start"
        ? anchorRect.top
        : anchorRect.bottom - popupRect.height;
    } else {
      if (vertical === "bottom" && !hasRoomBelow && hasRoomAbove) {
        vertical = "top";
      } else if (vertical === "top" && !hasRoomAbove && hasRoomBelow) {
        vertical = "bottom";
      }

      top = vertical === "bottom"
        ? anchorRect.bottom + offset
        : anchorRect.top - offset - popupRect.height;

      left = horizontal === "start"
        ? anchorRect.left
        : anchorRect.right - popupRect.width;

      const overflowsRight = left + popupRect.width > window.innerWidth - VIEWPORT_MARGIN;
      const overflowsLeft = left < VIEWPORT_MARGIN;

      if (horizontal === "start" && overflowsRight) {
        horizontal = "end";
        left = anchorRect.right - popupRect.width;
      } else if (horizontal === "end" && overflowsLeft) {
        horizontal = "start";
        left = anchorRect.left;
      }
    }

    left = clamp(left, VIEWPORT_MARGIN, window.innerWidth - VIEWPORT_MARGIN - popupRect.width);
    top = clamp(top, VIEWPORT_MARGIN, window.innerHeight - VIEWPORT_MARGIN - popupRect.height);

    setPosition({ left, top });
  };

  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    updatePosition();
    const id = window.requestAnimationFrame(updatePosition);
    return () => window.cancelAnimationFrame(id);
  }, [open, placement, offset]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onViewportChange = () => updatePosition();
    window.addEventListener("resize", onViewportChange, true);
    window.addEventListener("scroll", onViewportChange, true);

    return () => {
      window.removeEventListener("resize", onViewportChange, true);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [open]);

  if (!root || !open) {
    return null;
  }

  return createPortal(
    <div
      ref={popupRef}
      className={`floating-popup popup-layer-content z-50 min-w-[220px] ${className}`.trim()}
      style={{ position: "fixed", left: position.left, top: position.top }}
    >
      {children}
    </div>,
    root
  );
}
