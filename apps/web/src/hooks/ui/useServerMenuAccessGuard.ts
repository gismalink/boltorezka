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
  canManageChatImages: boolean;
  hasCurrentServer: boolean;
  setServerMenuTab: (value: ServerMenuTab) => void;
};

export function useServerMenuAccessGuard({
  serverMenuTab,
  canManageUsers,
  canManageServerControlPlane,
  canViewTelemetry,
  canManageAudioQuality,
  canManageChatImages,
  hasCurrentServer,
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
      return;
    }

    if (serverMenuTab === "chat_images" && !canManageChatImages) {
      setServerMenuTab("observability");
      return;
    }

    if (serverMenuTab === "server_management" && !hasCurrentServer) {
      setServerMenuTab("desktop_downloads");
      return;
    }

    if (serverMenuTab === "observability" && !hasCurrentServer) {
      setServerMenuTab("desktop_downloads");
    }
  }, [
    serverMenuTab,
    canManageUsers,
    canManageServerControlPlane,
    canViewTelemetry,
    canManageAudioQuality,
    canManageChatImages,
    hasCurrentServer,
    setServerMenuTab
  ]);
}
