import type { User } from "../../../domain";
import { useServerProfileModalProps } from "./useServerProfileModalProps";

type UseServerProfileModalPropsInput = Parameters<typeof useServerProfileModalProps>[0];

type UseAppServerProfileModalPropsInput = Omit<
  UseServerProfileModalPropsInput,
  "currentUserId" | "currentServerRole" | "currentServerName" | "hasCurrentServer"
> & {
  user: User | null;
  currentServer: { id?: string; role?: UseServerProfileModalPropsInput["currentServerRole"]; name?: string } | null;
};

export function useAppServerProfileModalProps({
  user,
  currentServer,
  ...rest
}: UseAppServerProfileModalPropsInput) {
  return useServerProfileModalProps({
    ...rest,
    currentUserId: user?.id || "",
    currentServerRole: currentServer?.role || null,
    currentServerName: currentServer?.name || "",
    hasCurrentServer: Boolean(currentServer?.id)
  });
}