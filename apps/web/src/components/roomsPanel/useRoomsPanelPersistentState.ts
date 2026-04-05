import { useEffect, useState } from "react";

const ROOMS_PANEL_GROUPS_STORAGE_KEY = "boltorezka_rooms_panel_groups";
const ROOMS_PANEL_MUTE_PRESETS_STORAGE_KEY = "boltorezka_room_mute_presets";

type RoomMutePreset = "1h" | "8h" | "24h" | "forever" | "off";

export function useRoomsPanelPersistentState() {
  const [uncategorizedCollapsed, setUncategorizedCollapsed] = useState<boolean>(() => {
    try {
      const parsed = JSON.parse(String(localStorage.getItem(ROOMS_PANEL_GROUPS_STORAGE_KEY) || "{}")) as {
        uncategorizedCollapsed?: boolean;
      };
      return Boolean(parsed.uncategorizedCollapsed);
    } catch {
      return false;
    }
  });

  const [outsideRoomsCollapsed, setOutsideRoomsCollapsed] = useState<boolean>(() => {
    try {
      const parsed = JSON.parse(String(localStorage.getItem(ROOMS_PANEL_GROUPS_STORAGE_KEY) || "{}")) as {
        outsideRoomsCollapsed?: boolean;
      };
      return Boolean(parsed.outsideRoomsCollapsed);
    } catch {
      return false;
    }
  });

  const [archivedCollapsed, setArchivedCollapsed] = useState<boolean>(() => {
    try {
      const parsed = JSON.parse(String(localStorage.getItem(ROOMS_PANEL_GROUPS_STORAGE_KEY) || "{}")) as {
        archivedCollapsed?: boolean;
      };
      return Boolean(parsed.archivedCollapsed);
    } catch {
      return false;
    }
  });

  const [roomMutePresetByRoomId, setRoomMutePresetByRoomId] = useState<Record<string, RoomMutePreset>>(() => {
    try {
      const parsed = JSON.parse(String(localStorage.getItem(ROOMS_PANEL_MUTE_PRESETS_STORAGE_KEY) || "{}")) as Record<string, unknown>;
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
    } catch {
      return {};
    }
  });

  useEffect(() => {
    localStorage.setItem(ROOMS_PANEL_GROUPS_STORAGE_KEY, JSON.stringify({
      uncategorizedCollapsed,
      outsideRoomsCollapsed,
      archivedCollapsed
    }));
  }, [uncategorizedCollapsed, outsideRoomsCollapsed, archivedCollapsed]);

  useEffect(() => {
    localStorage.setItem(ROOMS_PANEL_MUTE_PRESETS_STORAGE_KEY, JSON.stringify(roomMutePresetByRoomId));
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
    uncategorizedCollapsed,
    setUncategorizedCollapsed,
    outsideRoomsCollapsed,
    setOutsideRoomsCollapsed,
    archivedCollapsed,
    setArchivedCollapsed,
    roomMutePresetByRoomId,
    onRoomMutePresetChange
  };
}
