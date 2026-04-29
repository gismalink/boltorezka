/**
 * TopicActionsContext.tsx — контекст действий над топиками в чат-панели.
 * Содержит обработчики открытия, переименования, удаления и context-menu топиков.
 */
import { createContext, useContext, type ReactNode, type MouseEvent } from "react";

type TopicMutePreset = "1h" | "8h" | "24h" | "forever" | "off";

export type TopicActionsContextValue = {
  topicContextMenu: { topicId: string; x: number; y: number } | null;
  editingTopicTitle: string;
  setEditingTopicTitle: (value: string) => void;
  editingTopicTitleDraftInitial: string;
  setEditingTopicTitleDraftInitial: (value: string) => void;
  isEditingTopicTitleInline: boolean;
  setIsEditingTopicTitleInline: (value: boolean) => void;
  editingTopicSaving: boolean;
  archivingTopicId: string | null;
  notificationSaving: boolean;
  topicMutePresetById: Record<string, TopicMutePreset>;
  topicDeleteConfirm: { topicId: string; title: string } | null;
  setTopicDeleteConfirm: (value: { topicId: string; title: string } | null) => void;
  openTopicContextMenu: (topicId: string, event: MouseEvent<HTMLButtonElement>) => void;
  runTopicMenuAction: (action: "read" | "archive" | "delete") => Promise<void>;
  applyTopicRename: () => Promise<void>;
  confirmDeleteTopic: () => Promise<void>;
  setTopicMutePreset: (preset: TopicMutePreset) => Promise<void>;
};

const TopicActionsContext = createContext<TopicActionsContextValue | null>(null);

export function useTopicActionsCtx(): TopicActionsContextValue {
  const ctx = useContext(TopicActionsContext);
  if (!ctx) throw new Error("useTopicActionsCtx must be used inside TopicActionsProvider");
  return ctx;
}

export function TopicActionsProvider({ value, children }: { value: TopicActionsContextValue; children: ReactNode }) {
  return <TopicActionsContext.Provider value={value}>{children}</TopicActionsContext.Provider>;
}
