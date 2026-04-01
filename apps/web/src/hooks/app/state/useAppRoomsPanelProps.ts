import type { FormEvent } from "react";
import type { RoomKind } from "../../../domain";
import { useWorkspaceRoomsPanelProps } from "./useWorkspaceRoomsPanelProps";

type WorkspaceRoomsPanelInput = Parameters<typeof useWorkspaceRoomsPanelProps>[0];

type UseAppRoomsPanelPropsInput = Omit<
  WorkspaceRoomsPanelInput,
  | "onSetCategoryPopupOpen"
  | "onSetChannelPopupOpen"
  | "onSetNewCategorySlug"
  | "onSetNewCategoryTitle"
  | "onSetNewRoomSlug"
  | "onSetNewRoomTitle"
  | "onSetNewRoomKind"
  | "onSetNewRoomCategoryId"
  | "onSetEditingCategoryTitle"
  | "onSetEditingRoomTitle"
  | "onSetEditingRoomKind"
  | "onSetEditingRoomCategoryId"
  | "onSetEditingRoomNsfw"
  | "onSetEditingRoomAudioQualitySetting"
  | "onCreateCategory"
  | "onCreateRoom"
  | "onOpenCreateChannelPopup"
  | "onOpenCategorySettingsPopup"
  | "onOpenChannelSettingsPopup"
  | "onSaveCategorySettings"
  | "onSaveChannelSettings"
> & {
  setCategoryPopupOpen: (value: boolean) => void;
  setChannelPopupOpen: (value: boolean) => void;
  setNewCategorySlug: (value: string) => void;
  setNewCategoryTitle: (value: string) => void;
  setNewRoomSlug: (value: string) => void;
  setNewRoomTitle: (value: string) => void;
  setNewRoomKind: (value: RoomKind) => void;
  setNewRoomCategoryId: (value: string) => void;
  setEditingCategoryTitle: (value: string) => void;
  setEditingRoomTitle: (value: string) => void;
  setEditingRoomKind: (value: RoomKind) => void;
  setEditingRoomCategoryId: (value: string) => void;
  setEditingRoomNsfw: (value: boolean) => void;
  setEditingRoomAudioQualitySetting: (value: WorkspaceRoomsPanelInput["editingRoomAudioQualitySetting"]) => void;
  createCategory: (event: FormEvent) => void;
  createRoom: (event: FormEvent) => void;
  openCreateChannelPopup: (categoryId?: string) => void;
  openCategorySettingsPopup: (categoryId: string, categoryTitle: string) => void;
  openChannelSettingsPopup: WorkspaceRoomsPanelInput["onOpenChannelSettingsPopup"];
  saveCategorySettings: (event: FormEvent) => void;
  saveChannelSettings: (event: FormEvent) => void;
};

export function useAppRoomsPanelProps({
  setCategoryPopupOpen,
  setChannelPopupOpen,
  setNewCategorySlug,
  setNewCategoryTitle,
  setNewRoomSlug,
  setNewRoomTitle,
  setNewRoomKind,
  setNewRoomCategoryId,
  setEditingCategoryTitle,
  setEditingRoomTitle,
  setEditingRoomKind,
  setEditingRoomCategoryId,
  setEditingRoomNsfw,
  setEditingRoomAudioQualitySetting,
  createCategory,
  createRoom,
  openCreateChannelPopup,
  openCategorySettingsPopup,
  openChannelSettingsPopup,
  saveCategorySettings,
  saveChannelSettings,
  ...rest
}: UseAppRoomsPanelPropsInput) {
  return useWorkspaceRoomsPanelProps({
    ...rest,
    onSetCategoryPopupOpen: setCategoryPopupOpen,
    onSetChannelPopupOpen: setChannelPopupOpen,
    onSetNewCategorySlug: setNewCategorySlug,
    onSetNewCategoryTitle: setNewCategoryTitle,
    onSetNewRoomSlug: setNewRoomSlug,
    onSetNewRoomTitle: setNewRoomTitle,
    onSetNewRoomKind: setNewRoomKind,
    onSetNewRoomCategoryId: setNewRoomCategoryId,
    onSetEditingCategoryTitle: setEditingCategoryTitle,
    onSetEditingRoomTitle: setEditingRoomTitle,
    onSetEditingRoomKind: setEditingRoomKind,
    onSetEditingRoomCategoryId: setEditingRoomCategoryId,
    onSetEditingRoomNsfw: setEditingRoomNsfw,
    onSetEditingRoomAudioQualitySetting: setEditingRoomAudioQualitySetting,
    onCreateCategory: createCategory,
    onCreateRoom: createRoom,
    onOpenCreateChannelPopup: openCreateChannelPopup,
    onOpenCategorySettingsPopup: openCategorySettingsPopup,
    onOpenChannelSettingsPopup: openChannelSettingsPopup,
    onSaveCategorySettings: saveCategorySettings,
    onSaveChannelSettings: saveChannelSettings
  });
}