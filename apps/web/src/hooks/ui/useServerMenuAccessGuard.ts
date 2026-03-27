import { useEffect } from "react";

type ServerMenuTab =
  | "users"
  | "product_management"
  | "server_management"
  | "events"
  | "telemetry"
  | "call"
  | "sound"
  | "video"
  | "chat_images"
  | "desktop_downloads";

type UseServerMenuAccessGuardArgs = {
  serverMenuTab: ServerMenuTab;
  canManageUsers: boolean;
  canManageServerControlPlane: boolean;
  canViewTelemetry: boolean;
  canManageAudioQuality: boolean;
  setServerMenuTab: (value: ServerMenuTab) => void;
};

export function useServerMenuAccessGuard({
  serverMenuTab,
  canManageUsers,
  canManageServerControlPlane,
  canViewTelemetry,
  canManageAudioQuality,
  setServerMenuTab
}: UseServerMenuAccessGuardArgs) {
  useEffect(() => {
    if (serverMenuTab === "users" && !canManageUsers) {
      setServerMenuTab("events");
      return;
    }

    if ((serverMenuTab === "product_management" || serverMenuTab === "server_management") && !canManageServerControlPlane) {
      setServerMenuTab(canManageUsers ? "users" : "events");
      return;
    }

    if (serverMenuTab === "telemetry" && !canViewTelemetry) {
      setServerMenuTab("events");
      return;
    }

    if (serverMenuTab === "sound" && !canManageAudioQuality) {
      setServerMenuTab("events");
      return;
    }

    if (serverMenuTab === "video" && !canManageAudioQuality) {
      setServerMenuTab("events");
    }
  }, [
    serverMenuTab,
    canManageUsers,
    canManageServerControlPlane,
    canViewTelemetry,
    canManageAudioQuality,
    setServerMenuTab
  ]);
}
