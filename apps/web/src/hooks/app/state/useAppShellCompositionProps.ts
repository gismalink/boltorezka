import { useAppShellLayoutProps } from "./useAppShellLayoutProps";

type UseAppShellLayoutPropsInput = Parameters<typeof useAppShellLayoutProps>[0];

export function useAppShellCompositionProps({
  topChrome,
  mainSection,
  overlays
}: UseAppShellLayoutPropsInput) {
  return useAppShellLayoutProps({
    topChrome,
    mainSection,
    overlays
  });
}