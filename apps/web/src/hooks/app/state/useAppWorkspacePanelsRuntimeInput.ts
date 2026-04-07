import { api } from "../../../api";
import { useAppWorkspacePanelsRuntime } from "./useAppWorkspacePanelsRuntime";

type WorkspacePanelsRuntimeInput = Parameters<typeof useAppWorkspacePanelsRuntime>[0];
type RoomsPanelInput = WorkspacePanelsRuntimeInput["roomsPanel"];
type RoomMutePreset = Parameters<RoomsPanelInput["onSetRoomNotificationMutePreset"]>[1];

type WorkspacePanelsRuntimeAdapterInput = {
  token: string;
  roomsPanel: Omit<RoomsPanelInput, "onSetRoomNotificationMutePreset">;
  serverProfileModal: WorkspacePanelsRuntimeInput["serverProfileModal"];
  chatVideo: WorkspacePanelsRuntimeInput["chatVideo"];
};

export function useAppWorkspacePanelsRuntimeInput({
  token,
  roomsPanel,
  serverProfileModal,
  chatVideo
}: WorkspacePanelsRuntimeAdapterInput): WorkspacePanelsRuntimeInput {
  return {
    roomsPanel: {
      ...roomsPanel,
      onSetRoomNotificationMutePreset: async (roomId: string, preset: RoomMutePreset) => {
        const normalizedToken = String(token || "").trim();
        const normalizedRoomId = String(roomId || "").trim();
        if (!normalizedToken || !normalizedRoomId) {
          return;
        }

        const buildMuteUntilIso = (hours: number | "forever"): string => {
          const now = new Date();
          if (hours === "forever") {
            const forever = new Date(now);
            forever.setFullYear(forever.getFullYear() + 20);
            return forever.toISOString();
          }

          const next = new Date(now.getTime() + hours * 60 * 60 * 1000);
          return next.toISOString();
        };

        const muteUntil = preset === "off"
          ? null
          : preset === "forever"
            ? buildMuteUntilIso("forever")
            : buildMuteUntilIso(Number(preset.replace("h", "")));

        await api.updateNotificationSettings(normalizedToken, {
          scopeType: "room",
          roomId: normalizedRoomId,
          mode: "all",
          allowCriticalMentions: true,
          muteUntil
        });
      }
    },
    serverProfileModal,
    chatVideo
  };
}
