import { useEffect } from "react";

type ServerMenuTab =
  | "users"
  | "product_management"
  | "server_management"
  | "observability"
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
      setServerMenuTab("observability");
      return;
    }

    if (serverMenuTab === "product_management" && !canManageServerControlPlane) {
      setServerMenuTab(canManageUsers ? "users" : "observability");
      return;
    }

    if (serverMenuTab === "sound" && !canManageAudioQuality) {
      setServerMenuTab("observability");
      return;
    }

    if (serverMenuTab === "video" && !canManageAudioQuality) {
      setServerMenuTab("observability");
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
