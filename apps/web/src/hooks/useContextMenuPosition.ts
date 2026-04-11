import { useEffect, useState } from "react";

type ContextMenuState<T> = (T & { x: number; y: number }) | null;

export function useContextMenuPosition<T extends Record<string, unknown>>(options?: {
  skipSelector?: string;
}) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState<T>>(null);
  const skipSelector = options?.skipSelector;

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const onPointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) {
        setContextMenu(null);
        return;
      }

      if (skipSelector && target.closest(skipSelector)) {
        return;
      }

      setContextMenu(null);
    };

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setContextMenu(null);
      }
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [contextMenu, skipSelector]);

  return { contextMenu, setContextMenu };
}
