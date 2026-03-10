import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { TelemetrySummary } from "../../../domain";

type UseTelemetryRefreshArgs = {
  token: string;
  canViewTelemetry: boolean;
  wsState: "disconnected" | "connecting" | "connected";
  setTelemetrySummary: Dispatch<SetStateAction<TelemetrySummary | null>>;
  loadTelemetrySummary: () => Promise<void>;
};

export function useTelemetryRefresh({
  token,
  canViewTelemetry,
  wsState,
  setTelemetrySummary,
  loadTelemetrySummary
}: UseTelemetryRefreshArgs) {
  useEffect(() => {
    if (!token || !canViewTelemetry) {
      setTelemetrySummary(null);
      return;
    }

    void loadTelemetrySummary();
  }, [token, canViewTelemetry, loadTelemetrySummary, setTelemetrySummary]);

  useEffect(() => {
    if (wsState !== "connected") {
      return;
    }

    void loadTelemetrySummary();
  }, [wsState, loadTelemetrySummary]);
}
