import { useEffect, useMemo } from "react";
import { api } from "../../../api";
import type { UiTheme, User } from "../../../domain";
import { isEditableElement, normalizePushToTalkHotkey } from "../../../utils/pushToTalk";

type UseWalkieTalkieRuntimeArgs = {
  token: string;
  user: User | null;
  selectedUiTheme: UiTheme;
  walkieTalkieEnabled: boolean;
  walkieTalkieHotkey: string;
  setMicMuted: (value: boolean) => void;
  setUser: (value: User | null | ((prev: User | null) => User | null)) => void;
};

export function useWalkieTalkieRuntime({
  token,
  user,
  selectedUiTheme,
  walkieTalkieEnabled,
  walkieTalkieHotkey,
  setMicMuted,
  setUser
}: UseWalkieTalkieRuntimeArgs) {
  const walkieTalkieHotkeyNormalized = useMemo(
    () => normalizePushToTalkHotkey(walkieTalkieHotkey),
    [walkieTalkieHotkey]
  );

  useEffect(() => {
    if (!walkieTalkieEnabled) {
      return;
    }

    setMicMuted(true);
    let pressed = false;

    const activate = () => {
      pressed = true;
      setMicMuted(false);
    };

    const deactivate = () => {
      if (!pressed) {
        return;
      }
      pressed = false;
      setMicMuted(true);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || isEditableElement(event.target)) {
        return;
      }
      if (event.code !== walkieTalkieHotkeyNormalized) {
        return;
      }
      event.preventDefault();
      activate();
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== walkieTalkieHotkeyNormalized) {
        return;
      }
      event.preventDefault();
      deactivate();
    };

    const onBlur = () => deactivate();
    const onVisibilityChange = () => {
      if (document.hidden) {
        deactivate();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      deactivate();
    };
  }, [walkieTalkieEnabled, walkieTalkieHotkeyNormalized, setMicMuted]);

  useEffect(() => {
    if (!token || !user) {
      return;
    }

    const currentHotkey = normalizePushToTalkHotkey(user.walkie_talkie_hotkey);
    if (
      user.walkie_talkie_enabled === walkieTalkieEnabled
      && currentHotkey === walkieTalkieHotkeyNormalized
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      void api.updateMe(token, {
        name: user.name,
        uiTheme: selectedUiTheme,
        walkieTalkieEnabled,
        walkieTalkieHotkey: walkieTalkieHotkeyNormalized
      }).then((response) => {
        if (response.user) {
          setUser(response.user);
        }
      }).catch(() => {
        // Keep local preference and retry on next explicit change.
      });
    }, 250);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    token,
    user,
    selectedUiTheme,
    walkieTalkieEnabled,
    walkieTalkieHotkeyNormalized,
    setUser
  ]);

  return {
    walkieTalkieHotkeyNormalized
  };
}