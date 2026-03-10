import { RefObject, useEffect } from "react";

type UsePopupOutsideCloseArgs = {
  isAnyPopupOpen: boolean;
  profileMenuRef: RefObject<HTMLDivElement>;
  authMenuRef: RefObject<HTMLDivElement>;
  categoryPopupRef: RefObject<HTMLDivElement>;
  channelPopupRef: RefObject<HTMLDivElement>;
  audioOutputAnchorRef: RefObject<HTMLDivElement>;
  voiceSettingsAnchorRef: RefObject<HTMLDivElement>;
  userSettingsRef: RefObject<HTMLDivElement>;
  onCloseAll: () => void;
};

export function usePopupOutsideClose({
  isAnyPopupOpen,
  profileMenuRef,
  authMenuRef,
  categoryPopupRef,
  channelPopupRef,
  audioOutputAnchorRef,
  voiceSettingsAnchorRef,
  userSettingsRef,
  onCloseAll
}: UsePopupOutsideCloseArgs) {
  useEffect(() => {
    if (!isAnyPopupOpen) {
      return;
    }

    const onClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      const insideProfile = Boolean(target && profileMenuRef.current?.contains(target));
      const insideAuth = Boolean(target && authMenuRef.current?.contains(target));
      const insideCategoryPopup = Boolean(target && categoryPopupRef.current?.contains(target));
      const insideChannelPopup = Boolean(target && channelPopupRef.current?.contains(target));
      const insideChannelSettings = Boolean(target && target instanceof HTMLElement && target.closest(".channel-settings-anchor"));
      const insideCategorySettings = Boolean(target && target instanceof HTMLElement && target.closest(".category-settings-anchor"));
      const insideOutputSettings = Boolean(target && audioOutputAnchorRef.current?.contains(target));
      const insideVoiceSettings = Boolean(target && voiceSettingsAnchorRef.current?.contains(target));
      const insideUserSettings = Boolean(target && userSettingsRef.current?.contains(target));
      const insidePopupLayer = Boolean(target && target instanceof HTMLElement && target.closest(".popup-layer-content"));

      if (!insideProfile && !insideAuth && !insideCategoryPopup && !insideChannelPopup && !insideChannelSettings && !insideCategorySettings && !insideOutputSettings && !insideVoiceSettings && !insideUserSettings && !insidePopupLayer) {
        onCloseAll();
      }
    };

    window.addEventListener("mousedown", onClickOutside);
    return () => window.removeEventListener("mousedown", onClickOutside);
  }, [
    isAnyPopupOpen,
    profileMenuRef,
    authMenuRef,
    categoryPopupRef,
    channelPopupRef,
    audioOutputAnchorRef,
    voiceSettingsAnchorRef,
    userSettingsRef,
    onCloseAll
  ]);
}
