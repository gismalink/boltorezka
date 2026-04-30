import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../api";
import type { ServerListItem, User } from "../../../domain";
import { LOCALE_BY_LANG, TEXT, type Lang } from "../../../i18n";
import { asTrimmedString } from "../../../utils/stringUtils";

type UseAppPermissionsAndLocaleInput = {
  token: string;
  user: User | null;
  servers: ServerListItem[];
  currentServerId: string;
  adminUsers: User[];
  pendingJoinRequestsCount: number;
  lang: Lang;
  pushToast: (text: string) => void;
};

export function useAppPermissionsAndLocale({
  token,
  user,
  servers,
  currentServerId,
  adminUsers,
  pendingJoinRequestsCount,
  lang,
  pushToast
}: UseAppPermissionsAndLocaleInput) {
  const previousPendingRequestsCountRef = useRef<number | null>(null);
  const [resolvedServerPermissions, setResolvedServerPermissions] = useState<{
    manageRooms: boolean;
    viewTelemetry: boolean;
    manageGlobalUsers: boolean;
    manageServiceControlPlane: boolean;
  } | null>(null);

  const currentServerRole = useMemo(
    () => servers.find((item) => item.id === currentServerId)?.role || null,
    [servers, currentServerId]
  );
  const fallbackCanCreateRooms = Boolean(
    user && (
      user.role === "admin"
      || user.role === "super_admin"
      || currentServerRole === "owner"
      || currentServerRole === "admin"
    )
  );
  const fallbackCanManageUsers = user?.role === "admin" || user?.role === "super_admin";
  const fallbackCanPromote = user?.role === "super_admin";
  const canCreateRooms = resolvedServerPermissions?.manageRooms ?? fallbackCanCreateRooms;
  const canManageUsers = resolvedServerPermissions?.manageGlobalUsers ?? fallbackCanManageUsers;
  const canPromote = resolvedServerPermissions?.manageServiceControlPlane ?? fallbackCanPromote;
  const canUseService = Boolean(
    user && (user.role === "admin" || user.role === "super_admin" || user.access_state === "active")
  );
  const serviceToken = canUseService ? token : "";
  const canManageAudioQuality = canPromote;
  const canManageServerControlPlane = canPromote;
  const canViewTelemetry = resolvedServerPermissions?.viewTelemetry ?? (canPromote || canCreateRooms);
  const resolvedPendingJoinRequestsCount = useMemo(() => {
    if (!canPromote) {
      return 0;
    }

    const normalizedExternalCount = Math.max(0, Number(pendingJoinRequestsCount || 0));
    if (normalizedExternalCount > 0) {
      return normalizedExternalCount;
    }

    return adminUsers.filter((item) => !item.is_bot && !item.deleted_at && !item.is_banned && item.access_state === "pending").length;
  }, [adminUsers, canPromote, pendingJoinRequestsCount]);
  const locale = LOCALE_BY_LANG[lang];
  const t = useMemo(() => {
    const dict = TEXT[lang];
    return (key: string) => dict[key] || key;
  }, [lang]);

  useEffect(() => {
    const userId = asTrimmedString(user?.id);
    const serverId = asTrimmedString(currentServerId);
    if (!token || !userId || !serverId) {
      setResolvedServerPermissions(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const response = await api.serverPermissions(token, serverId);
        if (cancelled) {
          return;
        }

        setResolvedServerPermissions({
          manageRooms: response.permissions.manageRooms,
          viewTelemetry: response.permissions.viewTelemetry,
          manageGlobalUsers: response.permissions.manageGlobalUsers,
          manageServiceControlPlane: response.permissions.manageServiceControlPlane
        });
      } catch {
        if (!cancelled) {
          setResolvedServerPermissions(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, user?.id, currentServerId]);

  useEffect(() => {
    if (!canPromote) {
      previousPendingRequestsCountRef.current = null;
      return;
    }

    const previousCount = previousPendingRequestsCountRef.current;
    if (previousCount === null) {
      previousPendingRequestsCountRef.current = resolvedPendingJoinRequestsCount;
      return;
    }

    if (resolvedPendingJoinRequestsCount > previousCount) {
      const newRequestsCount = resolvedPendingJoinRequestsCount - previousCount;
      const toastText = t("admin.pendingRequestsToast")
        .replace("{new}", String(newRequestsCount))
        .replace("{total}", String(resolvedPendingJoinRequestsCount));

      pushToast(toastText);

      if (typeof window !== "undefined" && "Notification" in window) {
        const notificationTitle = t("admin.pendingRequestsNotificationTitle");
        const notificationBody = t("admin.pendingRequestsNotificationBody")
          .replace("{new}", String(newRequestsCount))
          .replace("{total}", String(resolvedPendingJoinRequestsCount));

        const showNotification = () => {
          new Notification(notificationTitle, {
            body: notificationBody,
            tag: "dato-pending-join-requests"
          });
        };

        if (Notification.permission === "granted") {
          showNotification();
        } else if (Notification.permission === "default") {
          void Notification.requestPermission().then((permission) => {
            if (permission === "granted") {
              showNotification();
            }
          });
        }
      }
    }

    previousPendingRequestsCountRef.current = resolvedPendingJoinRequestsCount;
  }, [canPromote, resolvedPendingJoinRequestsCount, pushToast, t]);

  return {
    canCreateRooms,
    canManageUsers,
    canPromote,
    canUseService,
    serviceToken,
    canManageAudioQuality,
    canManageServerControlPlane,
    canViewTelemetry,
    pendingJoinRequestsCount: resolvedPendingJoinRequestsCount,
    locale,
    t
  };
}