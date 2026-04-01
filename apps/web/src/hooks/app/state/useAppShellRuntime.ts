import { useAppMainSectionInput } from "./useAppMainSectionInput";
import { useAppOverlaysSectionInput } from "./useAppOverlaysSectionInput";
import { useAppShellCompositionProps } from "./useAppShellCompositionProps";
import { useAppTopChromeSectionInput } from "./useAppTopChromeSectionInput";

type UseAppShellRuntimeArgs = {
  topChrome: Parameters<typeof useAppTopChromeSectionInput>[0];
  mainSection: Parameters<typeof useAppMainSectionInput>[0];
  overlays: Parameters<typeof useAppOverlaysSectionInput>[0];
};

export function useAppShellRuntime({ topChrome, mainSection, overlays }: UseAppShellRuntimeArgs) {
  const topChromeSectionInput = useAppTopChromeSectionInput(topChrome);
  const mainSectionInput = useAppMainSectionInput(mainSection);
  const overlaysSectionInput = useAppOverlaysSectionInput(overlays);

  return useAppShellCompositionProps({
    topChrome: topChromeSectionInput,
    mainSection: mainSectionInput,
    overlays: overlaysSectionInput
  });
}
