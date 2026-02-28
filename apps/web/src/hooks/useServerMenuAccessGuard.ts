import { useEffect } from "react";

type ServerMenuTab = "users" | "events" | "telemetry" | "call";

type UseServerMenuAccessGuardArgs = {
  serverMenuTab: ServerMenuTab;
  canPromote: boolean;
  canViewTelemetry: boolean;
  setServerMenuTab: (value: ServerMenuTab) => void;
};

export function useServerMenuAccessGuard({
  serverMenuTab,
  canPromote,
  canViewTelemetry,
  setServerMenuTab
}: UseServerMenuAccessGuardArgs) {
  useEffect(() => {
    if (serverMenuTab === "users" && !canPromote) {
      setServerMenuTab("events");
      return;
    }

    if (serverMenuTab === "telemetry" && !canViewTelemetry) {
      setServerMenuTab("events");
    }
  }, [serverMenuTab, canPromote, canViewTelemetry, setServerMenuTab]);
}
