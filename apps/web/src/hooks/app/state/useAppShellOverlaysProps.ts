import { useMemo, type ComponentProps } from "react";
import { AppShellOverlays } from "../../../components/AppShellOverlays";

type AppShellOverlaysProps = ComponentProps<typeof AppShellOverlays>;

type UseAppShellOverlaysPropsInput = Omit<AppShellOverlaysProps, "onAcceptCookieConsent"> & {
  cookieConsentKey: string;
  setCookieConsentAccepted: (value: boolean) => void;
};

export function useAppShellOverlaysProps({
  cookieConsentKey,
  setCookieConsentAccepted,
  ...rest
}: UseAppShellOverlaysPropsInput): AppShellOverlaysProps {
  return useMemo(() => ({
    ...rest,
    onAcceptCookieConsent: () => {
      localStorage.setItem(cookieConsentKey, "1");
      setCookieConsentAccepted(true);
    }
  }), [rest, cookieConsentKey, setCookieConsentAccepted]);
}