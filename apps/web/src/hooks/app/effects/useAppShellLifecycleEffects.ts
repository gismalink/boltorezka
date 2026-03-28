import { useEffect, type Dispatch, type SetStateAction } from "react";
import { normalizeUiTheme } from "../../../utils/appShell";
import type { UiTheme, User } from "../../../domain";

type UseAppShellLifecycleEffectsArgs = {
  lang: string;
  selectedUiTheme: UiTheme;
  user: User | null;
  chatRoomSlug: string;
  setIsMobileViewport: Dispatch<SetStateAction<boolean>>;
  setProfileNameDraft: Dispatch<SetStateAction<string>>;
  setSelectedUiTheme: Dispatch<SetStateAction<UiTheme>>;
  setProfileStatusText: Dispatch<SetStateAction<string>>;
  setShowFirstRunIntro: Dispatch<SetStateAction<boolean>>;
  setEditingMessageId: Dispatch<SetStateAction<string | null>>;
  setPendingChatImageDataUrl: Dispatch<SetStateAction<string | null>>;
};

export function useAppShellLifecycleEffects({
  lang,
  selectedUiTheme,
  user,
  chatRoomSlug,
  setIsMobileViewport,
  setProfileNameDraft,
  setSelectedUiTheme,
  setProfileStatusText,
  setShowFirstRunIntro,
  setEditingMessageId,
  setPendingChatImageDataUrl
}: UseAppShellLifecycleEffectsArgs) {
  useEffect(() => {
    localStorage.setItem("boltorezka_lang", lang);
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    document.documentElement.setAttribute("data-ui-theme", selectedUiTheme);
    localStorage.setItem("boltorezka_ui_theme", selectedUiTheme);
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
    setProfileStatusText("");
  }, [user, setProfileNameDraft, setSelectedUiTheme, setProfileStatusText]);

  useEffect(() => {
    if (!user?.id) {
      setShowFirstRunIntro(false);
      return;
    }

    const storageKey = `boltorezka_intro_v1_seen:${user.id}`;
    const alreadySeen = localStorage.getItem(storageKey) === "1";
    setShowFirstRunIntro(!alreadySeen);
  }, [user?.id, setShowFirstRunIntro]);

  useEffect(() => {
    setEditingMessageId(null);
    setPendingChatImageDataUrl(null);
  }, [chatRoomSlug, setEditingMessageId, setPendingChatImageDataUrl]);
}
