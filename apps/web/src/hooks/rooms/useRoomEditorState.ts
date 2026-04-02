import { useState } from "react";
import type { ChannelAudioQualitySetting, RoomKind } from "../../domain";

export function useRoomEditorState() {
  const [newRoomSlug, setNewRoomSlug] = useState("");
  const [newRoomTitle, setNewRoomTitle] = useState("");
  const [newRoomKind, setNewRoomKind] = useState<RoomKind>("text");
  const [newRoomCategoryId, setNewRoomCategoryId] = useState<string>("none");
  const [newCategorySlug, setNewCategorySlug] = useState("");
  const [newCategoryTitle, setNewCategoryTitle] = useState("");
  const [categoryPopupOpen, setCategoryPopupOpen] = useState(false);
  const [channelPopupOpen, setChannelPopupOpen] = useState(false);
  const [categorySettingsPopupOpenId, setCategorySettingsPopupOpenId] = useState<string | null>(null);
  const [editingCategoryTitle, setEditingCategoryTitle] = useState("");
  const [channelSettingsPopupOpenId, setChannelSettingsPopupOpenId] = useState<string | null>(null);
  const [editingRoomTitle, setEditingRoomTitle] = useState("");
  const [editingRoomKind, setEditingRoomKind] = useState<RoomKind>("text");
  const [editingRoomCategoryId, setEditingRoomCategoryId] = useState<string>("none");
  const [editingRoomNsfw, setEditingRoomNsfw] = useState(false);
  const [editingRoomHidden, setEditingRoomHidden] = useState(false);
  const [editingRoomAudioQualitySetting, setEditingRoomAudioQualitySetting] = useState<ChannelAudioQualitySetting>("server_default");

  return {
    newRoomSlug,
    setNewRoomSlug,
    newRoomTitle,
    setNewRoomTitle,
    newRoomKind,
    setNewRoomKind,
    newRoomCategoryId,
    setNewRoomCategoryId,
    newCategorySlug,
    setNewCategorySlug,
    newCategoryTitle,
    setNewCategoryTitle,
    categoryPopupOpen,
    setCategoryPopupOpen,
    channelPopupOpen,
    setChannelPopupOpen,
    categorySettingsPopupOpenId,
    setCategorySettingsPopupOpenId,
    editingCategoryTitle,
    setEditingCategoryTitle,
    channelSettingsPopupOpenId,
    setChannelSettingsPopupOpenId,
    editingRoomTitle,
    setEditingRoomTitle,
    editingRoomKind,
    setEditingRoomKind,
    editingRoomCategoryId,
    setEditingRoomCategoryId,
    editingRoomNsfw,
    setEditingRoomNsfw,
    editingRoomHidden,
    setEditingRoomHidden,
    editingRoomAudioQualitySetting,
    setEditingRoomAudioQualitySetting
  };
}