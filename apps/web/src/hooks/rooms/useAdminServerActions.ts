import { useCallback, type Dispatch, type SetStateAction } from "react";
import { api } from "../../api";
import type { AdminServerListItem, ServerListItem } from "../../domain";
import { selectExistingServerId } from "./useServerProfileActions";
import { asTrimmedString } from "../../utils/stringUtils";

const selectExistingId = <T extends { id: string }>(items: T[], preferredId: string): string => {
  const normalizedPreferredId = asTrimmedString(preferredId);
  if (normalizedPreferredId && items.some((item) => item.id === normalizedPreferredId)) {
    return normalizedPreferredId;
  }

  return items[0]?.id || "";
};

type UseAdminServerActionsArgs = {
  token: string;
  setAdminServers: Dispatch<SetStateAction<AdminServerListItem[]>>;
  setServers: Dispatch<SetStateAction<ServerListItem[]>>;
  setSelectedAdminServerId: Dispatch<SetStateAction<string>>;
  setCurrentServerId: Dispatch<SetStateAction<string>>;
  pushToast: (message: string) => void;
  t: (key: string) => string;
};

export function useAdminServerActions({
  token,
  setAdminServers,
  setServers,
  setSelectedAdminServerId,
  setCurrentServerId,
  pushToast,
  t
}: UseAdminServerActionsArgs) {
  const handleToggleAdminServerBlocked = useCallback(async (serverId: string, blocked: boolean) => {
    const tokenValue = asTrimmedString(token);
    const targetServerId = asTrimmedString(serverId);

    if (!tokenValue || !targetServerId) {
      return;
    }

    try {
      await api.adminSetServerBlocked(tokenValue, targetServerId, blocked);
      setAdminServers((prev) => prev.map((item) => (
        item.id === targetServerId
          ? { ...item, isBlocked: blocked }
          : item
      )));

      const listResponse = await api.servers(tokenValue);
      const list = Array.isArray(listResponse.servers) ? listResponse.servers : [];
      setServers(list);
      setCurrentServerId((prev) => {
        const preferredId = prev === targetServerId && blocked ? "" : prev;
        return selectExistingServerId(list, preferredId);
      });
      pushToast(blocked ? t("server.managementBlock") : t("server.managementUnblock"));
    } catch (error) {
      pushToast((error as Error).message || t("toast.serverError"));
    }
  }, [pushToast, setAdminServers, setCurrentServerId, setServers, t, token]);

  const handleDeleteAdminServer = useCallback(async (serverId: string) => {
    const tokenValue = asTrimmedString(token);
    const targetServerId = asTrimmedString(serverId);

    if (!tokenValue || !targetServerId) {
      return;
    }

    try {
      await api.adminDeleteServer(tokenValue, targetServerId);

      const [adminServersResponse, serversResponse] = await Promise.all([
        api.adminServers(tokenValue),
        api.servers(tokenValue)
      ]);

      const adminList = Array.isArray(adminServersResponse.servers) ? adminServersResponse.servers : [];
      const userList = Array.isArray(serversResponse.servers) ? serversResponse.servers : [];

      setAdminServers(adminList);
      setServers(userList);
      setSelectedAdminServerId((prev) => {
        const preferredId = prev === targetServerId ? "" : prev;
        return selectExistingId(adminList, preferredId);
      });
      setCurrentServerId((prev) => {
        const preferredId = prev === targetServerId ? "" : prev;
        return selectExistingServerId(userList, preferredId);
      });
      pushToast(t("server.deleteSuccess"));
    } catch (error) {
      pushToast((error as Error).message || t("toast.serverError"));
    }
  }, [pushToast, setAdminServers, setCurrentServerId, setSelectedAdminServerId, setServers, t, token]);

  return {
    handleToggleAdminServerBlocked,
    handleDeleteAdminServer
  };
}