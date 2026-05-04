import { useEffect, type Dispatch, type SetStateAction } from "react";
import { normalizeUiTheme } from "../../../utils/appShell";
import type { UiTheme, User } from "../../../domain";
import { normalizePushToTalkHotkey } from "../../../utils/pushToTalk";

type UseAppShellLifecycleEffectsArgs = {
  lang: string;
  selectedUiTheme: UiTheme;
  user: User | null;
  chatRoomSlug: string;
  cookieConsentKey: string;
  setIsMobileViewport: Dispatch<SetStateAction<boolean>>;
  setProfileNameDraft: Dispatch<SetStateAction<string>>;
  setSelectedUiTheme: Dispatch<SetStateAction<UiTheme>>;
  setProfileStatusText: Dispatch<SetStateAction<string>>;
  setWalkieTalkieEnabled: Dispatch<SetStateAction<boolean>>;
  setWalkieTalkieHotkey: Dispatch<SetStateAction<string>>;
  setShowFirstRunIntro: Dispatch<SetStateAction<boolean>>;
  setCookieConsentAccepted: Dispatch<SetStateAction<boolean>>;
  setEditingMessageId: Dispatch<SetStateAction<string | null>>;
  setPendingChatImageDataUrl: Dispatch<SetStateAction<string | null>>;
};

export function useAppShellLifecycleEffects({
  lang,
  selectedUiTheme,
  user,
  chatRoomSlug,
  cookieConsentKey,
  setIsMobileViewport,
  setProfileNameDraft,
  setSelectedUiTheme,
  setProfileStatusText,
  setWalkieTalkieEnabled,
  setWalkieTalkieHotkey,
  setShowFirstRunIntro,
  setCookieConsentAccepted,
  setEditingMessageId,
  setPendingChatImageDataUrl
}: UseAppShellLifecycleEffectsArgs) {
  useEffect(() => {
    localStorage.setItem("datowave_lang", lang);
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    document.documentElement.setAttribute("data-ui-theme", selectedUiTheme);
    localStorage.setItem("datowave_ui_theme", selectedUiTheme);
  }, [selectedUiTheme]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 800px)");
    const apply = (matches: boolean) => {
      setIsMobileViewport(matches);
    };

    apply(mediaQuery.matches);

    const handler = (event: MediaQueryListEvent) => apply(event.matches);
    mediaQuery.addEventListener("change", handler);
    return () => {
      mediaQuery.removeEventListener("change", handler);
    };
  }, [setIsMobileViewport]);

  useEffect(() => {
    setProfileNameDraft(user?.name || "");
    setSelectedUiTheme(normalizeUiTheme(user?.ui_theme));
    if (typeof user?.walkie_talkie_enabled === "boolean") {
      setWalkieTalkieEnabled(user.walkie_talkie_enabled);
    }
    if (typeof user?.walkie_talkie_hotkey === "string") {
      setWalkieTalkieHotkey(normalizePushToTalkHotkey(user.walkie_talkie_hotkey));
    }
    setProfileStatusText("");
  }, [
    user,
    setProfileNameDraft,
    setSelectedUiTheme,
    setProfileStatusText,
    setWalkieTalkieEnabled,
    setWalkieTalkieHotkey
  ]);

  useEffect(() => {
    if (!user?.id) {
      setShowFirstRunIntro(false);
      return;
    }

    // Сервер — источник истины. Если backend сохранил факт прохождения
    // первой панели, оверлей не показываем и кэшируем флаг в localStorage,
    // чтобы при следующей загрузке не мигало даже до резолва /me.
    const storageKey = `datowave_intro_v1_seen:${user.id}`;
    if (user.welcome_intro_completed_at) {
      try { localStorage.setItem(storageKey, "1"); } catch { /* ignore */ }
      setShowFirstRunIntro(false);
      return;
    }

    const alreadySeen = localStorage.getItem(storageKey) === "1";
    setShowFirstRunIntro(!alreadySeen);
  }, [user?.id, user?.welcome_intro_completed_at, setShowFirstRunIntro]);

  // Синхронизация cookie-consent: серверное значение приоритетно над localStorage.
  useEffect(() => {
    if (!user?.id) {
      return;
    }
    if (user.cookie_consent_at) {
      try { localStorage.setItem(cookieConsentKey, "1"); } catch { /* ignore */ }
      setCookieConsentAccepted(true);
    }
  }, [user?.id, user?.cookie_consent_at, cookieConsentKey, setCookieConsentAccepted]);

  useEffect(() => {
    setEditingMessageId(null);
    setPendingChatImageDataUrl(null);
  }, [chatRoomSlug, setEditingMessageId, setPendingChatImageDataUrl]);
}
