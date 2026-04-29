import { useMemo, type ComponentProps } from "react";
import { AppShellOverlays } from "../../../components/AppShellOverlays";
import { api } from "../../../api";

type AppShellOverlaysProps = ComponentProps<typeof AppShellOverlays>;

type UseAppShellOverlaysPropsInput = Omit<AppShellOverlaysProps, "onAcceptCookieConsent"> & {
  cookieConsentKey: string;
  setCookieConsentAccepted: (value: boolean) => void;
  token: string;
};

export function useAppShellOverlaysProps({
  cookieConsentKey,
  setCookieConsentAccepted,
  token,
  ...rest
}: UseAppShellOverlaysPropsInput): AppShellOverlaysProps {
  return useMemo(() => ({
    ...rest,
    onAcceptCookieConsent: () => {
      // Локальный кэш — мгновенный UI, серверный POST — источник истины.
      localStorage.setItem(cookieConsentKey, "1");
      setCookieConsentAccepted(true);
      if (token) {
        api.acceptConsents(token, { cookieConsent: true }).catch(() => {
          /* best-effort: при ошибке остаётся клиентский кэш */
        });
      }
    }
  }), [rest, cookieConsentKey, setCookieConsentAccepted, token]);
}