import { useCallback, type Dispatch, type SetStateAction } from "react";
import { ApiError, api } from "../../api";
import type { ServerListItem, ServerMemberItem } from "../../domain";

export const selectExistingServerId = (servers: ServerListItem[], preferredServerId: string): string => {
  const normalizedPreferredServerId = String(preferredServerId || "").trim();
  if (normalizedPreferredServerId && servers.some((server) => server.id === normalizedPreferredServerId)) {
    return normalizedPreferredServerId;
  }

  return servers[0]?.id || "";
};

type UseServerProfileActionsArgs = {
  token: string;
  currentServerId: string;
  creatingInvite: boolean;
  serverAgeConfirming: boolean;
  serverAgeConfirmedAt: string | null;
  lastInviteUrl: string;
  setCreatingServer: Dispatch<SetStateAction<boolean>>;
  setServers: Dispatch<SetStateAction<ServerListItem[]>>;
  setCurrentServerId: Dispatch<SetStateAction<string>>;
  setCreatingInvite: Dispatch<SetStateAction<boolean>>;
  setLastInviteUrl: Dispatch<SetStateAction<string>>;
  setServerAgeConfirming: Dispatch<SetStateAction<boolean>>;
  setServerAgeConfirmedAt: Dispatch<SetStateAction<string | null>>;
  setServerMembers: Dispatch<SetStateAction<ServerMemberItem[]>>;
  pushToast: (message: string) => void;
  t: (key: string) => string;
};

export function useServerProfileActions({
  token,
  currentServerId,
  creatingInvite,
  serverAgeConfirming,
  serverAgeConfirmedAt,
  lastInviteUrl,
  setCreatingServer,
  setServers,
  setCurrentServerId,
  setCreatingInvite,
  setLastInviteUrl,
  setServerAgeConfirming,
  setServerAgeConfirmedAt,
  setServerMembers,
  pushToast,
  t
}: UseServerProfileActionsArgs) {
  const refreshServerMembers = useCallback(async (tokenValue: string, serverId: string) => {
    const response = await api.serverMembers(tokenValue, serverId);
    setServerMembers(Array.isArray(response.members) ? response.members : []);
  }, [setServerMembers]);

  const handleCreateServer = useCallback(async (name: string) => {
    const tokenValue = String(token || "").trim();
    const trimmedName = String(name || "").trim();

    if (!tokenValue || !trimmedName) {
      return;
    }

    setCreatingServer(true);
    try {
      const created = await api.createServer(tokenValue, { name: trimmedName });
      const listResponse = await api.servers(tokenValue);
      const list = Array.isArray(listResponse.servers) ? listResponse.servers : [];
      setServers(list);
      setCurrentServerId(created.server.id);
      pushToast(t("server.createSuccess"));
    } catch (error) {
      if (error instanceof ApiError && error.code === "ServerLimitReached") {
        pushToast(t("server.createLimitReached"));
      } else {
        pushToast((error as Error).message || t("toast.serverError"));
      }
    } finally {
      setCreatingServer(false);
    }
  }, [pushToast, setCreatingServer, setCurrentServerId, setServers, t, token]);

  const handleCreateServerInvite = useCallback(async () => {
    const tokenValue = String(token || "").trim();
    const serverId = String(currentServerId || "").trim();

    if (!tokenValue || !serverId || creatingInvite) {
      return;
    }

    setCreatingInvite(true);
    try {
      const result = await api.createServerInvite(tokenValue, serverId);
      const invitePath = String(result.inviteUrl || "").trim();
      const absoluteInviteUrl = invitePath.startsWith("/")
        ? `${window.location.origin}${invitePath}`
        : invitePath;
      setLastInviteUrl(absoluteInviteUrl);
      pushToast(t("server.inviteCreated"));
    } catch (error) {
      pushToast((error as Error).message || t("toast.serverError"));
    } finally {
      setCreatingInvite(false);
    }
  }, [creatingInvite, currentServerId, pushToast, setCreatingInvite, setLastInviteUrl, t, token]);

  const handleRenameCurrentServer = useCallback(async (nextName: string) => {
    const tokenValue = String(token || "").trim();
    const serverId = String(currentServerId || "").trim();
    const trimmedName = String(nextName || "").trim();

    if (!tokenValue || !serverId || !trimmedName) {
      return;
    }

    try {
      const response = await api.renameServer(tokenValue, serverId, { name: trimmedName });
      setServers((prev) => prev.map((item) => (item.id === serverId ? response.server : item)));
      pushToast(t("server.renameSuccess"));
    } catch (error) {
      pushToast((error as Error).message || t("toast.serverError"));
    }
  }, [currentServerId, pushToast, setServers, t, token]);

  const handleConfirmServerAge = useCallback(async () => {
    const tokenValue = String(token || "").trim();
    const serverId = String(currentServerId || "").trim();

    if (!tokenValue || !serverId || serverAgeConfirming) {
      return;
    }

    setServerAgeConfirming(true);
    try {
      const isConfirmed = Boolean(serverAgeConfirmedAt);
      const response = isConfirmed
        ? await api.revokeServerAge(tokenValue, serverId)
        : await api.confirmServerAge(tokenValue, serverId);
      setServerAgeConfirmedAt(response.confirmedAt || null);
      pushToast(t(isConfirmed ? "server.ageConfirmRevoked" : "server.ageConfirmSuccess"));
    } catch (error) {
      pushToast((error as Error).message || t("toast.serverError"));
    } finally {
      setServerAgeConfirming(false);
    }
  }, [currentServerId, pushToast, serverAgeConfirming, serverAgeConfirmedAt, setServerAgeConfirmedAt, setServerAgeConfirming, t, token]);

  const handleCopyInviteUrl = useCallback(async () => {
    const value = String(lastInviteUrl || "").trim();
    if (!value) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      pushToast(t("server.inviteCopied"));
    } catch {
      pushToast(t("server.inviteCopyFailed"));
    }
  }, [lastInviteUrl, pushToast, t]);

  const handleServerChange = useCallback((serverId: string) => {
    const nextServerId = String(serverId || "").trim();
    setCurrentServerId(nextServerId);
    setLastInviteUrl("");
  }, [setCurrentServerId, setLastInviteUrl]);

  const handleLeaveCurrentServer = useCallback(async () => {
    const tokenValue = String(token || "").trim();
    const serverId = String(currentServerId || "").trim();
    if (!tokenValue || !serverId) {
      return;
    }

    try {
      await api.leaveServer(tokenValue, serverId);
      const listResponse = await api.servers(tokenValue);
      const list = Array.isArray(listResponse.servers) ? listResponse.servers : [];
      setServers(list);
      setCurrentServerId((prev) => selectExistingServerId(list, prev));
      setLastInviteUrl("");
      pushToast(t("server.leaveSuccess"));
    } catch (error) {
      pushToast((error as Error).message || t("toast.serverError"));
    }
  }, [currentServerId, pushToast, setCurrentServerId, setLastInviteUrl, setServers, t, token]);

  const handleDeleteCurrentServer = useCallback(async () => {
    const tokenValue = String(token || "").trim();
    const serverId = String(currentServerId || "").trim();

    if (!tokenValue || !serverId) {
      return;
    }

    try {
      await api.deleteServer(tokenValue, serverId);

      const listResponse = await api.servers(tokenValue);
      const list = Array.isArray(listResponse.servers) ? listResponse.servers : [];
      setServers(list);
      setCurrentServerId((prev) => selectExistingServerId(list, prev));
      setLastInviteUrl("");
      pushToast(t("server.deleteSuccess"));
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === "forbidden_role") {
          pushToast(t("server.deleteForbidden"));
          return;
        }

        if (error.code === "DefaultServerCannotBeDeleted") {
          pushToast(t("server.deleteDefaultForbidden"));
          return;
        }
      }

      pushToast((error as Error).message || t("toast.serverError"));
    }
  }, [currentServerId, pushToast, setCurrentServerId, setLastInviteUrl, setServers, t, token]);

  const handleRemoveServerMember = useCallback(async (targetUserId: string) => {
    const tokenValue = String(token || "").trim();
    const serverId = String(currentServerId || "").trim();
    const userId = String(targetUserId || "").trim();

    if (!tokenValue || !serverId || !userId) {
      return;
    }

    try {
      await api.removeServerMember(tokenValue, serverId, userId);
      await refreshServerMembers(tokenValue, serverId);
      pushToast(t("server.memberRemoved"));
    } catch (error) {
      pushToast((error as Error).message || t("toast.serverError"));
    }
  }, [currentServerId, pushToast, refreshServerMembers, t, token]);

  const handleBanServerMember = useCallback(async (targetUserId: string) => {
    const tokenValue = String(token || "").trim();
    const serverId = String(currentServerId || "").trim();
    const userId = String(targetUserId || "").trim();

    if (!tokenValue || !serverId || !userId) {
      return;
    }

    try {
      await api.applyServerBan(tokenValue, serverId, userId, "manual server moderation");
      await refreshServerMembers(tokenValue, serverId);
      pushToast(t("server.memberBanned"));
    } catch (error) {
      pushToast((error as Error).message || t("toast.serverError"));
    }
  }, [currentServerId, pushToast, refreshServerMembers, t, token]);

  const handleUnbanServerMember = useCallback(async (targetUserId: string) => {
    const tokenValue = String(token || "").trim();
    const serverId = String(currentServerId || "").trim();
    const userId = String(targetUserId || "").trim();

    if (!tokenValue || !serverId || !userId) {
      return;
    }

    try {
      await api.revokeServerBan(tokenValue, serverId, userId);
      await refreshServerMembers(tokenValue, serverId);
      pushToast(t("server.memberUnbanned"));
    } catch (error) {
      pushToast((error as Error).message || t("toast.serverError"));
    }
  }, [currentServerId, pushToast, refreshServerMembers, t, token]);

  const handleTransferServerOwnership = useCallback(async (targetUserId: string) => {
    const tokenValue = String(token || "").trim();
    const serverId = String(currentServerId || "").trim();
    const userId = String(targetUserId || "").trim();

    if (!tokenValue || !serverId || !userId) {
      return;
    }

    try {
      await api.transferServerOwnership(tokenValue, serverId, userId);

      const serversResponse = await api.servers(tokenValue);
      await refreshServerMembers(tokenValue, serverId);
      setServers(Array.isArray(serversResponse.servers) ? serversResponse.servers : []);
      pushToast(t("server.ownerTransferred"));
    } catch (error) {
      pushToast((error as Error).message || t("toast.serverError"));
    }
  }, [currentServerId, pushToast, refreshServerMembers, setServers, t, token]);

  return {
    handleCreateServer,
    handleCreateServerInvite,
    handleRenameCurrentServer,
    handleConfirmServerAge,
    handleCopyInviteUrl,
    handleServerChange,
    handleLeaveCurrentServer,
    handleDeleteCurrentServer,
    handleRemoveServerMember,
    handleBanServerMember,
    handleUnbanServerMember,
    handleTransferServerOwnership
  };
}