import { useEffect } from "react";

type ServerMenuTab = "users" | "events" | "telemetry" | "call" | "sound";

type UseServerMenuAccessGuardArgs = {
  serverMenuTab: ServerMenuTab;
  canPromote: boolean;
  canViewTelemetry: boolean;
  canManageAudioQuality: boolean;
  setServerMenuTab: (value: ServerMenuTab) => void;
};

export function useServerMenuAccessGuard({
  serverMenuTab,
  canPromote,
  canViewTelemetry,
  canManageAudioQuality,
  setServerMenuTab
}: UseServerMenuAccessGuardArgs) {
  useEffect(() => {
    if (serverMenuTab === "users" && !canPromote) {
      setServerMenuTab("events");
      return;
    }

    if (serverMenuTab === "telemetry" && !canViewTelemetry) {
      setServerMenuTab("events");
      return;
    }

    if (serverMenuTab === "sound" && !canManageAudioQuality) {
      setServerMenuTab("events");
    }
  }, [serverMenuTab, canPromote, canViewTelemetry, canManageAudioQuality, setServerMenuTab]);
}
