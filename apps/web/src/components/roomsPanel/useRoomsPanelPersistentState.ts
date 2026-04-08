import { useEffect, useState } from "react";

const ROOMS_PANEL_GROUPS_STORAGE_KEY = "boltorezka_rooms_panel_groups";
const ROOMS_PANEL_MUTE_PRESETS_STORAGE_KEY = "boltorezka_room_mute_presets";

type RoomMutePreset = "1h" | "8h" | "24h" | "forever" | "off";

const canUseLocalStorage = (): boolean => {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
};

const readJsonRecord = (key: string): Record<string, unknown> => {
  if (!canUseLocalStorage()) {
    return {};
  }

  try {
    const raw = String(window.localStorage.getItem(key) || "{}");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const writeJsonRecord = (key: string, value: Record<string, unknown>): void => {
  if (!canUseLocalStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // no-op: local storage can be unavailable in private mode/quota exceeded
  }
};

export function useRoomsPanelPersistentState() {
  const [uncategorizedCollapsed, setUncategorizedCollapsed] = useState<boolean>(() => {
    const parsed = readJsonRecord(ROOMS_PANEL_GROUPS_STORAGE_KEY) as { uncategorizedCollapsed?: boolean };
    return Boolean(parsed.uncategorizedCollapsed);
  });

  const [outsideRoomsCollapsed, setOutsideRoomsCollapsed] = useState<boolean>(() => {
    const parsed = readJsonRecord(ROOMS_PANEL_GROUPS_STORAGE_KEY) as { outsideRoomsCollapsed?: boolean };
    return Boolean(parsed.outsideRoomsCollapsed);
  });

  const [offlineRoomsCollapsed, setOfflineRoomsCollapsed] = useState<boolean>(() => {
    const parsed = readJsonRecord(ROOMS_PANEL_GROUPS_STORAGE_KEY) as { offlineRoomsCollapsed?: boolean };
    return parsed.offlineRoomsCollapsed == null ? true : Boolean(parsed.offlineRoomsCollapsed);
  });

  const [archivedCollapsed, setArchivedCollapsed] = useState<boolean>(() => {
    const parsed = readJsonRecord(ROOMS_PANEL_GROUPS_STORAGE_KEY) as { archivedCollapsed?: boolean };
    return Boolean(parsed.archivedCollapsed);
  });

  const [roomMutePresetByRoomId, setRoomMutePresetByRoomId] = useState<Record<string, RoomMutePreset>>(() => {
    const parsed = readJsonRecord(ROOMS_PANEL_MUTE_PRESETS_STORAGE_KEY);
    return Object.entries(parsed).reduce<Record<string, RoomMutePreset>>((acc, [roomId, value]) => {
      const normalizedRoomId = String(roomId || "").trim();
      const normalized = String(value || "").trim() as RoomMutePreset;
      if (!normalizedRoomId) {
        return acc;
      }
      if (normalized === "1h" || normalized === "8h" || normalized === "24h" || normalized === "forever" || normalized === "off") {
        acc[normalizedRoomId] = normalized;
      }
      return acc;
    }, {});
  });

  useEffect(() => {
    writeJsonRecord(ROOMS_PANEL_GROUPS_STORAGE_KEY, {
      uncategorizedCollapsed,
      outsideRoomsCollapsed,
      offlineRoomsCollapsed,
      archivedCollapsed
    });
  }, [uncategorizedCollapsed, outsideRoomsCollapsed, offlineRoomsCollapsed, archivedCollapsed]);

  useEffect(() => {
    writeJsonRecord(ROOMS_PANEL_MUTE_PRESETS_STORAGE_KEY, roomMutePresetByRoomId);
  }, [roomMutePresetByRoomId]);

  const onRoomMutePresetChange = (roomId: string, preset: RoomMutePreset) => {
    const normalizedRoomId = String(roomId || "").trim();
    if (!normalizedRoomId) {
      return;
    }

    setRoomMutePresetByRoomId((prev) => ({
      ...prev,
      [normalizedRoomId]: preset
    }));
  };

  return {
    uncategorizedCollapsed, setUncategorizedCollapsed,
    outsideRoomsCollapsed, setOutsideRoomsCollapsed,
    offlineRoomsCollapsed, setOfflineRoomsCollapsed,
    archivedCollapsed, setArchivedCollapsed,
    roomMutePresetByRoomId,
    onRoomMutePresetChange
  };
}
