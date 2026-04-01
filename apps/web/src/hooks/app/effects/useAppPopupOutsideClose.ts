import { useCallback, useMemo } from "react";
import { usePopupOutsideClose } from "../../ui/usePopupOutsideClose";

type UsePopupOutsideCloseInput = Parameters<typeof usePopupOutsideClose>[0];

type UseAppPopupOutsideCloseInput = Omit<UsePopupOutsideCloseInput, "isAnyPopupOpen" | "onCloseAll"> & {
  profileMenuOpen: boolean;
  authMenuOpen: boolean;
  categoryPopupOpen: boolean;
  channelPopupOpen: boolean;
  channelSettingsPopupOpenId: string | null;
  categorySettingsPopupOpenId: string | null;
  audioOutputMenuOpen: boolean;
  voiceSettingsOpen: boolean;
  userSettingsOpen: boolean;
  setProfileMenuOpen: (value: boolean) => void;
  setAuthMenuOpen: (value: boolean) => void;
  setCategoryPopupOpen: (value: boolean) => void;
  setChannelPopupOpen: (value: boolean) => void;
  setChannelSettingsPopupOpenId: (value: string | null) => void;
  setCategorySettingsPopupOpenId: (value: string | null) => void;
  setAudioOutputMenuOpen: (value: boolean) => void;
  setVoiceSettingsOpen: (value: boolean) => void;
  setUserSettingsOpen: (value: boolean) => void;
};

export function useAppPopupOutsideClose({
  profileMenuOpen,
  authMenuOpen,
  categoryPopupOpen,
  channelPopupOpen,
  channelSettingsPopupOpenId,
  categorySettingsPopupOpenId,
  audioOutputMenuOpen,
  voiceSettingsOpen,
  userSettingsOpen,
  setProfileMenuOpen,
  setAuthMenuOpen,
  setCategoryPopupOpen,
  setChannelPopupOpen,
  setChannelSettingsPopupOpenId,
  setCategorySettingsPopupOpenId,
  setAudioOutputMenuOpen,
  setVoiceSettingsOpen,
  setUserSettingsOpen,
  ...refs
}: UseAppPopupOutsideCloseInput) {
  const isAnyPopupOpen = useMemo(() => Boolean(
    profileMenuOpen
    || authMenuOpen
    || categoryPopupOpen
    || channelPopupOpen
    || channelSettingsPopupOpenId
    || categorySettingsPopupOpenId
    || audioOutputMenuOpen
    || voiceSettingsOpen
    || userSettingsOpen
  ), [
    profileMenuOpen,
    authMenuOpen,
    categoryPopupOpen,
    channelPopupOpen,
    channelSettingsPopupOpenId,
    categorySettingsPopupOpenId,
    audioOutputMenuOpen,
    voiceSettingsOpen,
    userSettingsOpen
  ]);

  const onCloseAll = useCallback(() => {
    setProfileMenuOpen(false);
    setAuthMenuOpen(false);
    setCategoryPopupOpen(false);
    setChannelPopupOpen(false);
    setChannelSettingsPopupOpenId(null);
    setCategorySettingsPopupOpenId(null);
    setAudioOutputMenuOpen(false);
    setVoiceSettingsOpen(false);
    setUserSettingsOpen(false);
  }, [
    setProfileMenuOpen,
    setAuthMenuOpen,
    setCategoryPopupOpen,
    setChannelPopupOpen,
    setChannelSettingsPopupOpenId,
    setCategorySettingsPopupOpenId,
    setAudioOutputMenuOpen,
    setVoiceSettingsOpen,
    setUserSettingsOpen
  ]);

  usePopupOutsideClose({
    ...refs,
    isAnyPopupOpen,
    onCloseAll
  });
}