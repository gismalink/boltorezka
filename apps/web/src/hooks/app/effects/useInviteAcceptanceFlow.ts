import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { ApiError, api } from "../../../api";
import type { ServerListItem } from "../../../domain";
import { selectExistingServerId } from "../../rooms/useServerProfileActions";

function extractInviteTokenFromPath(pathname: string): string {
  const normalizedPathname = String(pathname || "").trim();
  if (!normalizedPathname) {
    return "";
  }

  const parts = normalizedPathname.split("/").filter((item) => item.length > 0);
  if (parts.length < 2 || parts[0].toLowerCase() !== "invite") {
    return "";
  }

  try {
    return decodeURIComponent(parts.slice(1).join("/")).trim();
  } catch {
    return parts.slice(1).join("/").trim();
  }
}

type UseInviteAcceptanceFlowArgs = {
  token: string;
  hasUser: boolean;
  pendingInviteToken: string;
  setPendingInviteToken: Dispatch<SetStateAction<string>>;
  setInviteAccepting: Dispatch<SetStateAction<boolean>>;
  setServers: Dispatch<SetStateAction<ServerListItem[]>>;
  setCurrentServerId: Dispatch<SetStateAction<string>>;
  pushToast: (message: string) => void;
  t: (key: string) => string;
};

export function useInviteAcceptanceFlow({
  token,
  hasUser,
  pendingInviteToken,
  setPendingInviteToken,
  setInviteAccepting,
  setServers,
  setCurrentServerId,
  pushToast,
  t
}: UseInviteAcceptanceFlowArgs) {
  const inviteAcceptAttemptedTokenRef = useRef("");

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const inviteToken = extractInviteTokenFromPath(window.location.pathname);
    setPendingInviteToken(inviteToken);
  }, [setPendingInviteToken]);

  useEffect(() => {
    const tokenValue = String(token || "").trim();
    const inviteToken = String(pendingInviteToken || "").trim();

    if (!tokenValue || !hasUser || !inviteToken) {
      return;
    }

    if (inviteAcceptAttemptedTokenRef.current === inviteToken) {
      return;
    }

    inviteAcceptAttemptedTokenRef.current = inviteToken;
    setInviteAccepting(true);

    api.acceptServerInvite(tokenValue, inviteToken)
      .then(async (result) => {
        const acceptedServerId = String(result.server?.id || "").trim();
        const listResponse = await api.servers(tokenValue);
        const list = Array.isArray(listResponse.servers) ? listResponse.servers : [];
        setServers(list);

        if (acceptedServerId) {
          setCurrentServerId(acceptedServerId);
        } else {
          setCurrentServerId((prev) => selectExistingServerId(list, prev));
        }

        if (typeof window !== "undefined" && extractInviteTokenFromPath(window.location.pathname)) {
          window.history.replaceState({}, "", "/");
        }

        setPendingInviteToken("");
        pushToast(t("server.inviteAcceptSuccess"));
      })
      .catch((error) => {
        let message = (error as Error).message || t("toast.serverError");

        if (error instanceof ApiError) {
          if (error.code === "InviteNotFound") {
            message = t("server.inviteAcceptNotFound");
          } else if (error.code === "InviteUnavailable") {
            message = t("server.inviteAcceptUnavailable");
          } else if (error.code === "server_banned") {
            message = t("server.inviteAcceptServerBanned");
          }
        }

        pushToast(message);
        if (typeof window !== "undefined" && extractInviteTokenFromPath(window.location.pathname)) {
          window.history.replaceState({}, "", "/");
        }
        setPendingInviteToken("");
      })
      .finally(() => {
        setInviteAccepting(false);
      });
  }, [
    token,
    hasUser,
    pendingInviteToken,
    setInviteAccepting,
    setPendingInviteToken,
    setServers,
    setCurrentServerId,
    pushToast,
    t
  ]);
}
