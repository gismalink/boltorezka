import { useCallback, useEffect, useRef, useState } from "react";
import { asTrimmedString } from "../../../utils/stringUtils";

const TOAST_AUTO_DISMISS_MS = 4500;
const TOAST_ID_RANDOM_RANGE = 10000;
const TOAST_DUPLICATE_THROTTLE_MS = 12000;
const TOAST_MAX_VISIBLE = 4;

export type AppToast = { id: number; message: string };

export function useToastQueue() {
  const [toasts, setToasts] = useState<AppToast[]>([]);
  const toastTimeoutsRef = useRef<Map<number, number>>(new Map());
  const toastLastShownAtRef = useRef<Map<string, number>>(new Map());

  const pushToast = useCallback((message: string) => {
    const normalized = asTrimmedString(message);
    if (!normalized) {
      return;
    }

    const now = Date.now();
    const lastAt = toastLastShownAtRef.current.get(normalized) || 0;
    if (now - lastAt < TOAST_DUPLICATE_THROTTLE_MS) {
      return;
    }
    toastLastShownAtRef.current.set(normalized, now);

    const toast = {
      id: Date.now() + Math.floor(Math.random() * TOAST_ID_RANDOM_RANGE),
      message: normalized
    };

    setToasts((prev) => {
      if (prev.some((item) => item.message === normalized)) {
        return prev;
      }

      const next = [...prev, toast];
      if (next.length <= TOAST_MAX_VISIBLE) {
        return next;
      }

      const [oldest, ...rest] = next;
      const timeoutId = toastTimeoutsRef.current.get(oldest.id);
      if (typeof timeoutId === "number") {
        window.clearTimeout(timeoutId);
        toastTimeoutsRef.current.delete(oldest.id);
      }

      return rest;
    });

    const timeoutId = window.setTimeout(() => {
      toastTimeoutsRef.current.delete(toast.id);
      setToasts((prev) => prev.filter((item) => item.id !== toast.id));
    }, TOAST_AUTO_DISMISS_MS);
    toastTimeoutsRef.current.set(toast.id, timeoutId);
  }, []);

  useEffect(() => {
    return () => {
      toastTimeoutsRef.current.forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      toastTimeoutsRef.current.clear();
      toastLastShownAtRef.current.clear();
    };
  }, []);

  return {
    toasts,
    pushToast
  };
}
