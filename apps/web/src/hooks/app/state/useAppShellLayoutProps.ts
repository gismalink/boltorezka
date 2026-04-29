import type { ComponentProps } from "react";
import { AppMainSection } from "../../../components/AppMainSection";
import { AppShellOverlays } from "../../../components/AppShellOverlays";
import { AppTopChrome } from "../../../components/AppTopChrome";
import { useAppMainSectionProps } from "./useAppMainSectionProps";
import { useAppShellOverlaysProps } from "./useAppShellOverlaysProps";
import { useAppTopChromeProps } from "./useAppTopChromeProps";

type AppTopChromeProps = ComponentProps<typeof AppTopChrome>;
type AppMainSectionProps = ComponentProps<typeof AppMainSection>;
type AppShellOverlaysProps = ComponentProps<typeof AppShellOverlays>;

type UseAppShellLayoutPropsInput = {
  topChrome: Omit<AppTopChromeProps, "onToggleAppMenu" | "onToggleAuthMenu" | "onToggleProfileMenu"> & {
    setAppMenuOpen: (value: boolean | ((value: boolean) => boolean)) => void;
    setAuthMenuOpen: (value: boolean | ((value: boolean) => boolean)) => void;
    setProfileMenuOpen: (value: boolean | ((value: boolean) => boolean)) => void;
  };
  mainSection: AppMainSectionProps;
  overlays: Omit<AppShellOverlaysProps, "onAcceptCookieConsent"> & {
    cookieConsentKey: string;
    setCookieConsentAccepted: (value: boolean) => void;
    token: string;
  };
};

export function useAppShellLayoutProps({ topChrome, mainSection, overlays }: UseAppShellLayoutPropsInput) {
  const appTopChromeProps = useAppTopChromeProps(topChrome);
  const appMainSectionProps = useAppMainSectionProps(mainSection);
  const appShellOverlaysProps = useAppShellOverlaysProps(overlays);

  return {
    appTopChromeProps,
    appMainSectionProps,
    appShellOverlaysProps
  };
}