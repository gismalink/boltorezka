import { useMemo } from "react";
import { useAppShellLayoutProps } from "./useAppShellLayoutProps";

type OverlaysInput = Parameters<typeof useAppShellLayoutProps>[0]["overlays"];

type UseAppOverlaysSectionInputArgs = OverlaysInput;

export function useAppOverlaysSectionInput(args: UseAppOverlaysSectionInputArgs): OverlaysInput {
  return useMemo(() => args, [args]);
}