import { FormEvent, useCallback } from "react";
import { RoomAdminController } from "../services";
import type { ChannelAudioQualitySetting, Message, MessagesCursor, Room, RoomKind } from "../domain";

type UseRoomAdminActionsArgs = {
  token: string;
  canCreateRooms: boolean;
  canManageAudioQuality: boolean;
  roomSlug: string;
  allRooms: Room[];
  roomAdminController: RoomAdminController;
  newRoomSlug: string;
  newRoomTitle: string;
  newRoomKind: RoomKind;
  newRoomCategoryId: string;
  newCategorySlug: string;
  newCategoryTitle: string;
  editingCategoryTitle: string;
  categorySettingsPopupOpenId: string | null;
  editingRoomTitle: string;
  editingRoomKind: RoomKind;
  editingRoomCategoryId: string;
  editingRoomAudioQualitySetting: ChannelAudioQualitySetting;
  channelSettingsPopupOpenId: string | null;
  setNewRoomSlug: (value: string) => void;
  setNewRoomTitle: (value: string) => void;
  setChannelPopupOpen: (value: boolean) => void;
  setNewCategorySlug: (value: string) => void;
  setNewCategoryTitle: (value: string) => void;
  setCategoryPopupOpen: (value: boolean) => void;
  setNewRoomCategoryId: (value: string) => void;
  setEditingRoomTitle: (value: string) => void;
  setEditingRoomKind: (value: RoomKind) => void;
  setEditingRoomCategoryId: (value: string) => void;
  setEditingRoomAudioQualitySetting: (value: ChannelAudioQualitySetting) => void;
  setChannelSettingsPopupOpenId: (value: string | null) => void;
  setEditingCategoryTitle: (value: string) => void;
  setCategorySettingsPopupOpenId: (value: string | null) => void;
  setMessages: (value: Message[] | ((prev: Message[]) => Message[])) => void;
  setMessagesHasMore: (value: boolean) => void;
  setMessagesNextCursor: (value: MessagesCursor | null) => void;
  joinRoom: (slug: string) => void;
};

export function useRoomAdminActions({
  token,
  canCreateRooms,
  canManageAudioQuality,
  roomSlug,
  allRooms,
  roomAdminController,
  newRoomSlug,
  newRoomTitle,
  newRoomKind,
  newRoomCategoryId,
  newCategorySlug,
  newCategoryTitle,
  editingCategoryTitle,
  categorySettingsPopupOpenId,
  editingRoomTitle,
  editingRoomKind,
  editingRoomCategoryId,
  editingRoomAudioQualitySetting,
  channelSettingsPopupOpenId,
  setNewRoomSlug,
  setNewRoomTitle,
  setChannelPopupOpen,
  setNewCategorySlug,
  setNewCategoryTitle,
  setCategoryPopupOpen,
  setNewRoomCategoryId,
  setEditingRoomTitle,
  setEditingRoomKind,
  setEditingRoomCategoryId,
  setEditingRoomAudioQualitySetting,
  setChannelSettingsPopupOpenId,
  setEditingCategoryTitle,
  setCategorySettingsPopupOpenId,
  setMessages,
  setMessagesHasMore,
  setMessagesNextCursor,
  joinRoom
}: UseRoomAdminActionsArgs) {
  const createRoom = useCallback(async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !canCreateRooms) return;

    const created = await roomAdminController.createRoom(token, newRoomSlug, newRoomTitle, {
      kind: newRoomKind,
      categoryId: newRoomCategoryId === "none" ? null : newRoomCategoryId,
      audioQualityOverride: canManageAudioQuality
        ? null
        : undefined
    });
    if (created) {
      setNewRoomSlug("");
      setNewRoomTitle("");
      setChannelPopupOpen(false);
    }
  }, [
    token,
    canCreateRooms,
    roomAdminController,
    newRoomSlug,
    newRoomTitle,
    newRoomKind,
    newRoomCategoryId,
    canManageAudioQuality,
    setNewRoomSlug,
    setNewRoomTitle,
    setChannelPopupOpen
  ]);

  const createCategory = useCallback(async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !canCreateRooms) return;

    const created = await roomAdminController.createCategory(token, newCategorySlug, newCategoryTitle);
    if (created) {
      setNewCategorySlug("");
      setNewCategoryTitle("");
      setCategoryPopupOpen(false);
    }
  }, [
    token,
    canCreateRooms,
    roomAdminController,
    newCategorySlug,
    newCategoryTitle,
    setNewCategorySlug,
    setNewCategoryTitle,
    setCategoryPopupOpen
  ]);

  const openCreateChannelPopup = useCallback((categoryId: string | null = null) => {
    setNewRoomCategoryId(categoryId || "none");
    setChannelPopupOpen(true);
  }, [setNewRoomCategoryId, setChannelPopupOpen]);

  const openChannelSettingsPopup = useCallback((room: Room) => {
    setEditingRoomTitle(room.title);
    setEditingRoomKind(room.kind);
    setEditingRoomCategoryId(room.category_id || "none");
    setEditingRoomAudioQualitySetting(room.audio_quality_override ?? "server_default");
    setChannelSettingsPopupOpenId(room.id);
  }, [
    setEditingRoomTitle,
    setEditingRoomKind,
    setEditingRoomCategoryId,
    setEditingRoomAudioQualitySetting,
    setChannelSettingsPopupOpenId
  ]);

  const openCategorySettingsPopup = useCallback((categoryId: string, categoryTitle: string) => {
    setEditingCategoryTitle(categoryTitle);
    setCategorySettingsPopupOpenId(categoryId);
  }, [setEditingCategoryTitle, setCategorySettingsPopupOpenId]);

  const saveCategorySettings = useCallback(async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !categorySettingsPopupOpenId) {
      return;
    }

    const updated = await roomAdminController.updateCategory(token, categorySettingsPopupOpenId, editingCategoryTitle);
    if (updated) {
      setCategorySettingsPopupOpenId(null);
    }
  }, [token, categorySettingsPopupOpenId, roomAdminController, editingCategoryTitle, setCategorySettingsPopupOpenId]);

  const moveCategory = useCallback(async (direction: "up" | "down") => {
    if (!token || !categorySettingsPopupOpenId) {
      return;
    }

    await roomAdminController.moveCategory(token, categorySettingsPopupOpenId, direction);
  }, [token, categorySettingsPopupOpenId, roomAdminController]);

  const deleteCategory = useCallback(async () => {
    if (!token || !categorySettingsPopupOpenId) {
      return;
    }

    const deleted = await roomAdminController.deleteCategory(token, categorySettingsPopupOpenId);
    if (deleted) {
      setCategorySettingsPopupOpenId(null);
    }
  }, [token, categorySettingsPopupOpenId, roomAdminController, setCategorySettingsPopupOpenId]);

  const saveChannelSettings = useCallback(async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !channelSettingsPopupOpenId) {
      return;
    }

    const updated = await roomAdminController.updateRoom(token, channelSettingsPopupOpenId, {
      title: editingRoomTitle,
      kind: editingRoomKind,
      categoryId: editingRoomCategoryId === "none" ? null : editingRoomCategoryId,
      audioQualityOverride: canManageAudioQuality
        ? (editingRoomAudioQualitySetting === "server_default" ? null : editingRoomAudioQualitySetting)
        : undefined
    });

    if (updated) {
      setChannelSettingsPopupOpenId(null);
    }
  }, [
    token,
    channelSettingsPopupOpenId,
    roomAdminController,
    editingRoomTitle,
    editingRoomKind,
    editingRoomCategoryId,
    editingRoomAudioQualitySetting,
    canManageAudioQuality,
    setChannelSettingsPopupOpenId
  ]);

  const moveChannel = useCallback(async (direction: "up" | "down") => {
    if (!token || !channelSettingsPopupOpenId) {
      return;
    }

    await roomAdminController.moveRoom(token, channelSettingsPopupOpenId, direction);
  }, [token, channelSettingsPopupOpenId, roomAdminController]);

  const deleteChannel = useCallback(async (room: Room) => {
    if (!token || !channelSettingsPopupOpenId) {
      return;
    }

    const deleted = await roomAdminController.deleteRoom(token, channelSettingsPopupOpenId);
    if (!deleted) {
      return;
    }

    if (room.slug === roomSlug) {
      const fallbackRoom = allRooms.find((item) => item.id !== room.id && item.slug === "general")
        || allRooms.find((item) => item.id !== room.id)
        || null;

      if (fallbackRoom) {
        joinRoom(fallbackRoom.slug);
      }
    }

    setChannelSettingsPopupOpenId(null);
  }, [token, channelSettingsPopupOpenId, roomAdminController, roomSlug, allRooms, joinRoom, setChannelSettingsPopupOpenId]);

  const clearChannelMessages = useCallback(async (room: Room) => {
    if (!token || !channelSettingsPopupOpenId) {
      return;
    }

    const cleared = await roomAdminController.clearRoomMessages(token, channelSettingsPopupOpenId);
    if (!cleared) {
      return;
    }

    if (room.slug === roomSlug) {
      setMessages([]);
      setMessagesHasMore(false);
      setMessagesNextCursor(null);
    }
  }, [
    token,
    channelSettingsPopupOpenId,
    roomAdminController,
    roomSlug,
    setMessages,
    setMessagesHasMore,
    setMessagesNextCursor
  ]);

  return {
    createRoom,
    createCategory,
    openCreateChannelPopup,
    openChannelSettingsPopup,
    openCategorySettingsPopup,
    saveCategorySettings,
    moveCategory,
    deleteCategory,
    saveChannelSettings,
    moveChannel,
    deleteChannel,
    clearChannelMessages
  };
}
