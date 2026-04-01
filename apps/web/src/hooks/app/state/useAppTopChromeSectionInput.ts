import { useMemo } from "react";
import { useAppShellLayoutProps } from "./useAppShellLayoutProps";

type TopChromeSectionInput = Parameters<typeof useAppShellLayoutProps>[0]["topChrome"];

type UseAppTopChromeSectionInputArgs = Omit<
  TopChromeSectionInput,
  "currentServerName" | "onOpenUserSettings" | "onChangeCurrentServer"
> & {
  currentServer: { name?: string } | null;
  openProfileSettings: () => void;
  setCurrentServerId: (serverId: string) => void;
};

export function useAppTopChromeSectionInput({
  currentServer,
  openProfileSettings,
  setCurrentServerId,
  ...rest
}: UseAppTopChromeSectionInputArgs): TopChromeSectionInput {
  return useMemo(() => ({
    ...rest,
    currentServerName: currentServer?.name || null,
    onOpenUserSettings: openProfileSettings,
    onChangeCurrentServer: setCurrentServerId
  }), [currentServer, openProfileSettings, setCurrentServerId, rest]);
}