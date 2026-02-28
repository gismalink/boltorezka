import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Placement = "above" | "below";

type TooltipState = {
  visible: boolean;
  text: string;
  placement: Placement;
  left: number;
  top: number;
};

const BODY_CLASS = "tooltip-portal-enabled";
const OFFSET_PX = 8;
const VIEWPORT_MARGIN_PX = 8;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const findTooltipAnchor = (target: EventTarget | null): HTMLElement | null => {
  if (!target || !(target instanceof HTMLElement)) {
    return null;
  }

  return target.closest("[data-tooltip]");
};

const getTooltipText = (anchor: HTMLElement | null): string => {
  if (!anchor) {
    return "";
  }

  return String(anchor.getAttribute("data-tooltip") || "").trim();
};

export function TooltipPortal() {
  const root = useMemo(() => {
    if (typeof document === "undefined") {
      return null;
    }

    let node = document.getElementById("tooltip-root");
    if (!node) {
      node = document.createElement("div");
      node.id = "tooltip-root";
      document.body.appendChild(node);
    }

    return node;
  }, []);

  const anchorRef = useRef<HTMLElement | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);

  const [state, setState] = useState<TooltipState>({
    visible: false,
    text: "",
    placement: "below",
    left: 0,
    top: 0
  });

  const hide = () => {
    anchorRef.current = null;
    setState((prev) => (prev.visible ? { ...prev, visible: false } : prev));
  };

  const showForAnchor = (anchor: HTMLElement) => {
    const text = getTooltipText(anchor);
    if (!text) {
      hide();
      return;
    }

    anchorRef.current = anchor;
    setState((prev) => ({
      ...prev,
      visible: true,
      text
    }));
  };

  const updatePosition = () => {
    const anchor = anchorRef.current;
    const bubble = bubbleRef.current;
    if (!anchor || !bubble) {
      return;
    }

    const rect = anchor.getBoundingClientRect();
    const bubbleRect = bubble.getBoundingClientRect();
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    const desiredLeft = rect.left + rect.width / 2;
    const left = clamp(
      desiredLeft,
      VIEWPORT_MARGIN_PX + bubbleRect.width / 2,
      viewportW - VIEWPORT_MARGIN_PX - bubbleRect.width / 2
    );

    const belowTop = rect.bottom + OFFSET_PX;
    const aboveTop = rect.top - OFFSET_PX - bubbleRect.height;
    const wouldOverflowBottom = belowTop + bubbleRect.height > viewportH - VIEWPORT_MARGIN_PX;
    const hasRoomAbove = aboveTop > VIEWPORT_MARGIN_PX;
    const placement: Placement = wouldOverflowBottom && hasRoomAbove ? "above" : "below";
    const top = placement === "below" ? belowTop : aboveTop;

    setState((prev) => ({
      ...prev,
      left,
      top,
      placement
    }));
  };

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    document.body.classList.add(BODY_CLASS);
    return () => {
      document.body.classList.remove(BODY_CLASS);
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const onPointerOver = (event: PointerEvent) => {
      const anchor = findTooltipAnchor(event.target);
      if (anchor) {
        showForAnchor(anchor);
      }
    };

    const onPointerOut = (event: PointerEvent) => {
      const anchor = anchorRef.current;
      if (!anchor) {
        return;
      }

      const related = event.relatedTarget;
      if (related instanceof Node && anchor.contains(related)) {
        return;
      }

      hide();
    };

    const onFocusIn = (event: FocusEvent) => {
      const anchor = findTooltipAnchor(event.target);
      if (anchor) {
        showForAnchor(anchor);
      }
    };

    const onFocusOut = () => {
      hide();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        hide();
      }
    };

    const onScrollOrResize = () => {
      if (anchorRef.current) {
        updatePosition();
      }
    };

    document.addEventListener("pointerover", onPointerOver, true);
    document.addEventListener("pointerout", onPointerOut, true);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize, true);

    return () => {
      document.removeEventListener("pointerover", onPointerOver, true);
      document.removeEventListener("pointerout", onPointerOut, true);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", onFocusOut, true);
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize, true);
    };
  }, []);

  useLayoutEffect(() => {
    if (!state.visible) {
      return;
    }

    updatePosition();
    const id = window.requestAnimationFrame(updatePosition);
    return () => window.cancelAnimationFrame(id);
  }, [state.visible, state.text]);

  if (!root) {
    return null;
  }

  return createPortal(
    <div className="tooltip-portal" aria-hidden={!state.visible}>
      <div
        ref={bubbleRef}
        className="tooltip-bubble"
        data-visible={state.visible ? "true" : "false"}
        data-placement={state.placement}
        style={{ left: state.left, top: state.top }}
        role="tooltip"
      >
        {state.text}
      </div>
    </div>,
    root
  );
}