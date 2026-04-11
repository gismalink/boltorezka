import { useState, type MouseEvent } from "react";
import { api } from "../../../api";
import type { RoomTopic } from "../../../domain";
import { useContextMenuPosition } from "../../../hooks/useContextMenuPosition";

type TopicMutePreset = "1h" | "8h" | "24h" | "forever" | "off";

type UseChatPanelTopicActionsArgs = {
  t: (key: string) => string;
  authToken: string;
  topics: RoomTopic[];
  isTopicProtected: (topicId: string) => boolean;
  canManageTopicModeration: boolean;
  notificationMode: "all" | "mentions" | "none";
  markTopicRead: (topicId: string, lastReadMessageId?: string) => Promise<void>;
  onUpdateTopic: (topicId: string, title: string) => Promise<void>;
  onArchiveTopic: (topicId: string) => Promise<void>;
  onUnarchiveTopic: (topicId: string) => Promise<void>;
  onDeleteTopic: (topicId: string) => Promise<void>;
};

export function useChatPanelTopicActions({
  t,
  authToken,
  topics,
  isTopicProtected,
  canManageTopicModeration,
  notificationMode,
  markTopicRead,
  onUpdateTopic,
  onArchiveTopic,
  onUnarchiveTopic,
  onDeleteTopic
}: UseChatPanelTopicActionsArgs) {
  const [editingTopicTitle, setEditingTopicTitle] = useState("");
  const [editingTopicTitleDraftInitial, setEditingTopicTitleDraftInitial] = useState("");
  const [isEditingTopicTitleInline, setIsEditingTopicTitleInline] = useState(false);
  const [editingTopicSaving, setEditingTopicSaving] = useState(false);
  const [editingTopicStatusText, setEditingTopicStatusText] = useState("");
  const [archivingTopicId, setArchivingTopicId] = useState<string | null>(null);
  const { contextMenu: topicContextMenu, setContextMenu: setTopicContextMenu } =
    useContextMenuPosition<{ topicId: string }>({ skipSelector: ".chat-topic-context-menu" });
  const [topicDeleteConfirm, setTopicDeleteConfirm] = useState<{ topicId: string; title: string } | null>(null);
  const [topicMutePresetById, setTopicMutePresetById] = useState<Record<string, TopicMutePreset>>({});
  const [notificationSaving, setNotificationSaving] = useState(false);

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

  const updateTopicMuteSettings = async (topicId: string, muteUntil: string | null) => {
    if (!authToken || notificationSaving || !topicId) {
      return;
    }

    setNotificationSaving(true);
    setEditingTopicStatusText("");
    try {
      await api.updateNotificationSettings(authToken, {
        scopeType: "topic",
        topicId,
        mode: notificationMode,
        allowCriticalMentions: true,
        muteUntil
      });
      setEditingTopicStatusText(t("chat.notificationSaved"));
    } catch {
      setEditingTopicStatusText(t("chat.notificationSaveError"));
    } finally {
      setNotificationSaving(false);
    }
  };

  const openTopicContextMenu = (topicId: string, event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const targetTopic = topics.find((topic) => topic.id === topicId);
    setEditingTopicTitle(String(targetTopic?.title || ""));
    setEditingTopicTitleDraftInitial(String(targetTopic?.title || ""));
    setIsEditingTopicTitleInline(false);
    setTopicContextMenu({ topicId, x: event.clientX, y: event.clientY });
  };

  const runTopicMenuAction = async (action: "read" | "archive" | "delete") => {
    const targetTopicId = String(topicContextMenu?.topicId || "").trim();
    if (!targetTopicId) {
      setTopicContextMenu(null);
      return;
    }

    const targetTopic = topics.find((topic) => topic.id === targetTopicId);
    if (!targetTopic) {
      setTopicContextMenu(null);
      return;
    }

    if (action === "read") {
      await markTopicRead(targetTopic.id);
      setTopicContextMenu(null);
      return;
    }

    if (!canManageTopicModeration) {
      setTopicContextMenu(null);
      return;
    }

    if (action === "delete") {
      if (isTopicProtected(targetTopic.id)) {
        setEditingTopicStatusText(t("chat.mainTopicProtected"));
        setTopicContextMenu(null);
        return;
      }
      setTopicDeleteConfirm({ topicId: targetTopic.id, title: targetTopic.title });
      setTopicContextMenu(null);
      return;
    }

    setArchivingTopicId(targetTopic.id);
    try {
      if (targetTopic.archivedAt) {
        await onUnarchiveTopic(targetTopic.id);
        setEditingTopicStatusText(t("chat.unarchiveTopicSuccess"));
      } else {
        await onArchiveTopic(targetTopic.id);
        setEditingTopicStatusText(t("chat.archiveTopicSuccess"));
      }
    } catch {
      setEditingTopicStatusText(targetTopic.archivedAt ? t("chat.unarchiveTopicError") : t("chat.archiveTopicError"));
    } finally {
      setArchivingTopicId(null);
      setTopicContextMenu(null);
    }
  };

  const applyTopicRename = async () => {
    const targetTopicId = String(topicContextMenu?.topicId || "").trim();
    const trimmedTitle = editingTopicTitle.trim();
    if (!targetTopicId || !trimmedTitle || editingTopicSaving) {
      return;
    }

    if (!canManageTopicModeration) {
      setEditingTopicStatusText(t("chat.mainTopicProtected"));
      return;
    }

    if (isTopicProtected(targetTopicId)) {
      setEditingTopicStatusText(t("chat.mainTopicProtected"));
      return;
    }

    setEditingTopicSaving(true);
    setEditingTopicStatusText("");
    try {
      await onUpdateTopic(targetTopicId, trimmedTitle);
      setEditingTopicTitleDraftInitial(trimmedTitle);
      setIsEditingTopicTitleInline(false);
      setEditingTopicStatusText(t("chat.editTopicSuccess"));
    } catch {
      setEditingTopicStatusText(t("chat.editTopicError"));
    } finally {
      setEditingTopicSaving(false);
    }
  };

  const confirmDeleteTopic = async () => {
    const topicId = String(topicDeleteConfirm?.topicId || "").trim();
    if (!topicId || editingTopicSaving) {
      return;
    }

    setEditingTopicSaving(true);
    try {
      await onDeleteTopic(topicId);
      setEditingTopicStatusText(t("chat.deleteTopicSuccess"));
    } catch {
      setEditingTopicStatusText(t("chat.deleteTopicError"));
    } finally {
      setEditingTopicSaving(false);
      setTopicDeleteConfirm(null);
    }
  };

  const setTopicMutePreset = async (preset: TopicMutePreset) => {
    const targetTopicId = String(topicContextMenu?.topicId || "").trim();
    if (!targetTopicId) {
      return;
    }

    const activePreset = topicMutePresetById[targetTopicId] || null;
    const nextPreset: TopicMutePreset = activePreset === preset ? "off" : preset;

    const muteUntil = nextPreset === "off"
      ? null
      : nextPreset === "forever"
        ? buildMuteUntilIso("forever")
        : buildMuteUntilIso(Number(nextPreset.replace("h", "")));

    await updateTopicMuteSettings(targetTopicId, muteUntil);
    setTopicMutePresetById((prev) => ({ ...prev, [targetTopicId]: nextPreset }));
    setTopicContextMenu(null);
  };

  return {
    topicContextMenu,
    setTopicContextMenu,
    editingTopicTitle,
    setEditingTopicTitle,
    editingTopicTitleDraftInitial,
    setEditingTopicTitleDraftInitial,
    isEditingTopicTitleInline,
    setIsEditingTopicTitleInline,
    editingTopicSaving,
    editingTopicStatusText,
    setEditingTopicStatusText,
    archivingTopicId,
    notificationSaving,
    topicMutePresetById,
    topicDeleteConfirm,
    setTopicDeleteConfirm,
    openTopicContextMenu,
    runTopicMenuAction,
    applyTopicRename,
    confirmDeleteTopic,
    setTopicMutePreset
  };
}
