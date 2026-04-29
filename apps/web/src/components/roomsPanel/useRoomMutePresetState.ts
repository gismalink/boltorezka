/**
 * useRoomMutePresetState.ts — хук локальных пресетов мьюта комнаты.
 * Хранит выбранный пресет (off/30m/1h/forever) и строку дедлайна для UI.
 */
import { useCallback, useEffect, useState } from "react";
import type { TranslateFn } from "../../i18n";

type RoomMutePreset = "1h" | "8h" | "24h" | "forever" | "off";

type UseRoomMutePresetStateInput = {
  t: TranslateFn;
  roomId: string;
  roomMutePresetValue: RoomMutePreset | null;
  onRoomMutePresetChange: (roomId: string, preset: RoomMutePreset) => void;
  onSetRoomNotificationMutePreset: (roomId: string, preset: RoomMutePreset) => Promise<void>;
};

export function useRoomMutePresetState({
  t,
  roomId,
  roomMutePresetValue,
  onRoomMutePresetChange,
  onSetRoomNotificationMutePreset
}: UseRoomMutePresetStateInput) {
  const [roomMutePreset, setRoomMutePreset] = useState<RoomMutePreset | null>(null);
  const [roomMuteSaving, setRoomMuteSaving] = useState(false);
  const [roomMuteStatusText, setRoomMuteStatusText] = useState("");

  useEffect(() => {
    setRoomMutePreset(roomMutePresetValue);
  }, [roomMutePresetValue]);

  const clearRoomMuteStatusText = useCallback(() => {
    setRoomMuteStatusText("");
  }, []);

  const applyRoomMutePreset = useCallback(async (preset: RoomMutePreset) => {
    if (roomMuteSaving) {
      return;
    }

    const nextPreset = roomMutePreset === preset ? "off" : preset;

    setRoomMuteSaving(true);
    setRoomMuteStatusText("");
    try {
      await onSetRoomNotificationMutePreset(roomId, nextPreset);
      setRoomMutePreset(nextPreset);
      onRoomMutePresetChange(roomId, nextPreset);
      setRoomMuteStatusText(t("chat.notificationSaved"));
    } catch {
      setRoomMuteStatusText(t("chat.notificationSaveError"));
    } finally {
      setRoomMuteSaving(false);
    }
  }, [onRoomMutePresetChange, onSetRoomNotificationMutePreset, roomId, roomMutePreset, roomMuteSaving, t]);

  return {
    roomMutePreset,
    roomMuteSaving,
    roomMuteStatusText,
    clearRoomMuteStatusText,
    applyRoomMutePreset
  };
}
