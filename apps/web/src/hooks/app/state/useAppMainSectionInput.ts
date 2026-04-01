import { useMemo } from "react";
import { useAppShellLayoutProps } from "./useAppShellLayoutProps";

type MainSectionInput = Parameters<typeof useAppShellLayoutProps>[0]["mainSection"];

type UseAppMainSectionInputArgs = Omit<MainSectionInput, "onCreateServer" | "onSelectMobileTab"> & {
  handleCreateServer: MainSectionInput["onCreateServer"];
  setMobileTab: MainSectionInput["onSelectMobileTab"];
};

export function useAppMainSectionInput({
  handleCreateServer,
  setMobileTab,
  ...rest
}: UseAppMainSectionInputArgs): MainSectionInput {
  return useMemo(() => ({
    ...rest,
    onCreateServer: handleCreateServer,
    onSelectMobileTab: setMobileTab
  }), [rest, handleCreateServer, setMobileTab]);
}