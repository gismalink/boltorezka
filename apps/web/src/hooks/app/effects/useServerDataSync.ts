import { useEffect, type Dispatch, type SetStateAction } from "react";
import { api } from "../../../api";
import type { AdminServerListItem, AdminServerOverview, ServerListItem, ServerMemberItem } from "../../../domain";

const selectExistingServerId = (servers: ServerListItem[], preferredServerId: string): string => {
  const normalizedPreferredServerId = String(preferredServerId || "").trim();
  if (normalizedPreferredServerId && servers.some((server) => server.id === normalizedPreferredServerId)) {
    return normalizedPreferredServerId;
  }

  return servers[0]?.id || "";
};

type UseServerDataSyncArgs = {
  token: string;
  hasUser: boolean;
  currentServerId: string;
  selectedAdminServerId: string;
  canManageServerControlPlane: boolean;
  currentServerIdStorageKey: string;
  setServerAgeConfirmedAt: Dispatch<SetStateAction<string | null>>;
  setServerAgeLoading: Dispatch<SetStateAction<boolean>>;
  setServers: Dispatch<SetStateAction<ServerListItem[]>>;
  setServersLoading: Dispatch<SetStateAction<boolean>>;
  setCurrentServerId: Dispatch<SetStateAction<string>>;
  setServerMembers: Dispatch<SetStateAction<ServerMemberItem[]>>;
  setServerMembersLoading: Dispatch<SetStateAction<boolean>>;
  setAdminServers: Dispatch<SetStateAction<AdminServerListItem[]>>;
  setSelectedAdminServerId: Dispatch<SetStateAction<string>>;
  setAdminServerOverview: Dispatch<SetStateAction<AdminServerOverview | null>>;
  setAdminServersLoading: Dispatch<SetStateAction<boolean>>;
  setAdminServerOverviewLoading: Dispatch<SetStateAction<boolean>>;
  pushLog: (text: string) => void;
};

export function useServerDataSync({
  token,
  hasUser,
  currentServerId,
  selectedAdminServerId,
  canManageServerControlPlane,
  currentServerIdStorageKey,
  setServerAgeConfirmedAt,
  setServerAgeLoading,
  setServers,
  setServersLoading,
  setCurrentServerId,
  setServerMembers,
  setServerMembersLoading,
  setAdminServers,
  setSelectedAdminServerId,
  setAdminServerOverview,
  setAdminServersLoading,
  setAdminServerOverviewLoading,
  pushLog
}: UseServerDataSyncArgs) {
  useEffect(() => {
    const tokenValue = String(token || "").trim();
    const serverId = String(currentServerId || "").trim();

    if (!tokenValue || !serverId || !hasUser) {
      setServerAgeConfirmedAt(null);
      setServerAgeLoading(false);
      return;
    }

    let cancelled = false;
    setServerAgeLoading(true);

    api.serverAgeStatus(tokenValue, serverId)
      .then((response) => {
        if (cancelled) {
          return;
        }

        setServerAgeConfirmedAt(response.confirmed ? response.confirmedAt || null : null);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        pushLog(`server age status failed: ${(error as Error).message}`);
        setServerAgeConfirmedAt(null);
      })
      .finally(() => {
        if (!cancelled) {
          setServerAgeLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token, currentServerId, hasUser, pushLog, setServerAgeConfirmedAt, setServerAgeLoading]);

  useEffect(() => {
    if (currentServerId) {
      localStorage.setItem(currentServerIdStorageKey, currentServerId);
      return;
    }

    localStorage.removeItem(currentServerIdStorageKey);
  }, [currentServerId, currentServerIdStorageKey]);

  useEffect(() => {
    if (!token || !hasUser) {
      setServers([]);
      setServersLoading(false);
      setCurrentServerId("");
      return;
    }

    let cancelled = false;
    setServersLoading(true);
    api.servers(token)
      .then((response) => {
        if (cancelled) {
          return;
        }

        const list = Array.isArray(response.servers) ? response.servers : [];
        setServers(list);

        const ids = new Set(list.map((item) => item.id));
        const persistedId = String(localStorage.getItem(currentServerIdStorageKey) || "").trim();
        setCurrentServerId((prev) => {
          const preferredId = ids.has(prev) ? prev : persistedId;
          return selectExistingServerId(list, preferredId);
        });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        pushLog(`servers failed: ${(error as Error).message}`);
        setServers([]);
        setCurrentServerId("");
      })
      .finally(() => {
        if (!cancelled) {
          setServersLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    token,
    hasUser,
    currentServerIdStorageKey,
    pushLog,
    setCurrentServerId,
    setServers,
    setServersLoading
  ]);

  useEffect(() => {
    const tokenValue = String(token || "").trim();
    const serverId = String(currentServerId || "").trim();

    if (!tokenValue || !serverId || !hasUser) {
      setServerMembers([]);
      return;
    }

    let cancelled = false;
    setServerMembersLoading(true);
    api.serverMembers(tokenValue, serverId)
      .then((response) => {
        if (cancelled) {
          return;
        }
        setServerMembers(Array.isArray(response.members) ? response.members : []);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        pushLog(`server members failed: ${(error as Error).message}`);
        setServerMembers([]);
      })
      .finally(() => {
        if (!cancelled) {
          setServerMembersLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    token,
    currentServerId,
    hasUser,
    pushLog,
    setServerMembers,
    setServerMembersLoading
  ]);

  useEffect(() => {
    const tokenValue = String(token || "").trim();

    if (!tokenValue || !canManageServerControlPlane) {
      setAdminServers([]);
      setSelectedAdminServerId("");
      setAdminServerOverview(null);
      setAdminServersLoading(false);
      setAdminServerOverviewLoading(false);
      return;
    }

    let cancelled = false;
    setAdminServersLoading(true);

    api.adminServers(tokenValue)
      .then((response) => {
        if (cancelled) {
          return;
        }

        const list = Array.isArray(response.servers) ? response.servers : [];
        setAdminServers(list);

        const ids = new Set(list.map((item) => item.id));
        const preferredId = String(currentServerId || "").trim();

        setSelectedAdminServerId((prev) => {
          if (ids.has(prev)) {
            return prev;
          }

          if (preferredId && ids.has(preferredId)) {
            return preferredId;
          }

          return list[0]?.id || "";
        });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        pushLog(`admin servers failed: ${(error as Error).message}`);
        setAdminServers([]);
        setSelectedAdminServerId("");
      })
      .finally(() => {
        if (!cancelled) {
          setAdminServersLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    token,
    canManageServerControlPlane,
    currentServerId,
    pushLog,
    setAdminServers,
    setAdminServerOverview,
    setAdminServerOverviewLoading,
    setAdminServersLoading,
    setSelectedAdminServerId
  ]);

  useEffect(() => {
    const tokenValue = String(token || "").trim();
    const serverId = String(selectedAdminServerId || "").trim();

    if (!tokenValue || !serverId || !canManageServerControlPlane) {
      setAdminServerOverview(null);
      setAdminServerOverviewLoading(false);
      return;
    }

    let cancelled = false;
    setAdminServerOverviewLoading(true);

    api.adminServerOverview(tokenValue, serverId)
      .then((response) => {
        if (cancelled) {
          return;
        }

        setAdminServerOverview(response.server || null);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        pushLog(`admin server overview failed: ${(error as Error).message}`);
        setAdminServerOverview(null);
      })
      .finally(() => {
        if (!cancelled) {
          setAdminServerOverviewLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    token,
    selectedAdminServerId,
    canManageServerControlPlane,
    pushLog,
    setAdminServerOverview,
    setAdminServerOverviewLoading
  ]);
}
