import { type FormEvent, useCallback, useEffect, useRef } from "react";

type UseRoomSettingsAutosaveInput = {
  channelSettingsPopupOpenId: string | null;
  roomId: string;
  onSaveChannelSettings: (event: FormEvent) => void;
};

export function useRoomSettingsAutosave({
  channelSettingsPopupOpenId,
  roomId,
  onSaveChannelSettings
}: UseRoomSettingsAutosaveInput) {
  const roomSettingsAutosaveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (roomSettingsAutosaveTimerRef.current) {
        window.clearTimeout(roomSettingsAutosaveTimerRef.current);
      }
    };
  }, []);

  const requestRoomSettingsAutosave = useCallback(() => {
    if (channelSettingsPopupOpenId !== roomId) {
      return;
    }

    if (roomSettingsAutosaveTimerRef.current) {
      window.clearTimeout(roomSettingsAutosaveTimerRef.current);
    }

    roomSettingsAutosaveTimerRef.current = window.setTimeout(() => {
      const fakeEvent = { preventDefault: () => {} } as FormEvent;
      onSaveChannelSettings(fakeEvent);
      roomSettingsAutosaveTimerRef.current = null;
    }, 120);
  }, [channelSettingsPopupOpenId, onSaveChannelSettings, roomId]);

  return {
    requestRoomSettingsAutosave
  };
}
