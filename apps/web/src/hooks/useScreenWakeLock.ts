import { useCallback, useEffect, useRef } from "react";

type WakeLockSentinelLike = {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: "release", listener: () => void) => void;
};

type WakeLockNavigator = Navigator & {
  wakeLock?: {
    request: (type: "screen") => Promise<WakeLockSentinelLike>;
  };
};

export function useScreenWakeLock(enabled: boolean) {
  const sentinelRef = useRef<WakeLockSentinelLike | null>(null);

  const releaseWakeLock = useCallback(async () => {
    const sentinel = sentinelRef.current;
    if (!sentinel) {
      return;
    }

    sentinelRef.current = null;
    if (!sentinel.released) {
      await sentinel.release();
    }
  }, []);

  const requestWakeLock = useCallback(async () => {
    if (!enabled || document.visibilityState !== "visible") {
      return;
    }

    if (sentinelRef.current && !sentinelRef.current.released) {
      return;
    }

    const wakeLockApi = (navigator as WakeLockNavigator).wakeLock;
    if (!wakeLockApi?.request) {
      return;
    }

    try {
      const sentinel = await wakeLockApi.request("screen");
      sentinelRef.current = sentinel;
      sentinel.addEventListener("release", () => {
        if (sentinelRef.current === sentinel) {
          sentinelRef.current = null;
        }
      });
    } catch {
      sentinelRef.current = null;
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      void releaseWakeLock();
      return;
    }

    void requestWakeLock();
    return () => {
      void releaseWakeLock();
    };
  }, [enabled, requestWakeLock, releaseWakeLock]);

  useEffect(() => {
    const handleVisibility = () => {
      if (!enabled) {
        return;
      }

      if (document.visibilityState === "visible") {
        void requestWakeLock();
      } else {
        void releaseWakeLock();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [enabled, requestWakeLock, releaseWakeLock]);
}
