import { KeyboardEvent, RefObject } from "react";
import { createPortal } from "react-dom";
import type { RoomTopic } from "../../../domain";
import { Button } from "../../uicomponents";
import { TopicContextMenu } from "./TopicContextMenu";

type ChatPanelOverlaysProps = {
  t: (key: string) => string;
  previewImageUrl: string | null;
  setPreviewImageUrl: (value: string | null) => void;
  resolveAttachmentImageUrl: (url: string) => string;
  topicPaletteOpen: boolean;
  closeTopicPalette: () => void;
  topicPaletteQuery: string;
  setTopicPaletteQuery: (value: string) => void;
  handleTopicPaletteKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  topicPaletteInputRef: RefObject<HTMLInputElement | null>;
  topicPaletteListboxId: string;
  filteredTopicsForPalette: RoomTopic[];
  topicPaletteSelectedIndex: number;
  activeTopicId: string | null;
  getTopicUnreadCount: (topic: RoomTopic) => number;
  setTopicPaletteSelectedIndex: (value: number) => void;
  selectTopicFromPalette: (topicId: string) => void;
  topicContextMenu: { topicId: string; x: number; y: number } | null;
  topics: RoomTopic[];
  editingTopicSaving: boolean;
  archivingTopicId: string | null;
  notificationSaving: boolean;
  editingTopicTitle: string;
  setEditingTopicTitle: (value: string) => void;
  isEditingTopicTitleInline: boolean;
  onStartTopicRenameInline: () => void;
  onCancelTopicRenameInline: () => void;
  applyTopicRename: () => Promise<void>;
  runTopicMenuAction: (action: "read" | "archive" | "delete") => Promise<void>;
  topicMutePresetById: Record<string, "1h" | "8h" | "24h" | "forever" | "off">;
  setTopicMutePreset: (preset: "1h" | "8h" | "24h" | "forever" | "off") => Promise<void>;
  topicDeleteConfirm: { topicId: string; title: string } | null;
  setTopicDeleteConfirm: (value: { topicId: string; title: string } | null) => void;
  confirmDeleteTopic: () => Promise<void>;
};

export function ChatPanelOverlays({
  t,
  previewImageUrl,
  setPreviewImageUrl,
  resolveAttachmentImageUrl,
  topicPaletteOpen,
  closeTopicPalette,
  topicPaletteQuery,
  setTopicPaletteQuery,
  handleTopicPaletteKeyDown,
  topicPaletteInputRef,
  topicPaletteListboxId,
  filteredTopicsForPalette,
  topicPaletteSelectedIndex,
  activeTopicId,
  getTopicUnreadCount,
  setTopicPaletteSelectedIndex,
  selectTopicFromPalette,
  topicContextMenu,
  topics,
  editingTopicSaving,
  archivingTopicId,
  notificationSaving,
  editingTopicTitle,
  setEditingTopicTitle,
  isEditingTopicTitleInline,
  onStartTopicRenameInline,
  onCancelTopicRenameInline,
  applyTopicRename,
  runTopicMenuAction,
  topicMutePresetById,
  setTopicMutePreset,
  topicDeleteConfirm,
  setTopicDeleteConfirm,
  confirmDeleteTopic
}: ChatPanelOverlaysProps) {
  return (
    <>
      {previewImageUrl && typeof document !== "undefined"
        ? createPortal(
          <div
            className="chat-image-modal-overlay"
            role="dialog"
            aria-modal="true"
            aria-label={t("chat.imagePreviewTitle")}
            onClick={() => setPreviewImageUrl(null)}
          >
            <div className="chat-image-modal-card" onClick={(event) => event.stopPropagation()}>
              <Button
                type="button"
                className="secondary tiny chat-image-modal-close"
                onClick={() => setPreviewImageUrl(null)}
              >
                {t("chat.closeImagePreview")}
              </Button>
              <img
                src={resolveAttachmentImageUrl(previewImageUrl)}
                alt="chat-image-preview"
                className="chat-image-modal-media"
              />
            </div>
          </div>,
          document.body
        )
        : null}
      {topicPaletteOpen && typeof document !== "undefined"
        ? createPortal(
          <div
            className="chat-topic-palette-overlay"
            id="chat-topic-palette-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={t("chat.topicPaletteTitle")}
            onClick={closeTopicPalette}
          >
            <section
              className="chat-topic-palette-card"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="chat-topic-palette-head">
                <h3>{t("chat.topicPaletteTitle")}</h3>
                <Button type="button" className="secondary tiny" onClick={closeTopicPalette}>
                  {t("chat.editTopicCancel")}
                </Button>
              </div>
              <input
                ref={topicPaletteInputRef}
                type="search"
                value={topicPaletteQuery}
                onChange={(event) => setTopicPaletteQuery(event.target.value)}
                onKeyDown={handleTopicPaletteKeyDown}
                placeholder={t("chat.topicPalettePlaceholder")}
                className="chat-topic-palette-input"
                aria-label={t("chat.topicPalettePlaceholder")}
                aria-controls={topicPaletteListboxId}
                aria-activedescendant={filteredTopicsForPalette[topicPaletteSelectedIndex] ? `chat-topic-option-${filteredTopicsForPalette[topicPaletteSelectedIndex].id}` : undefined}
              />
              <div id={topicPaletteListboxId} className="chat-topic-palette-list" role="listbox" aria-label={t("chat.topicPaletteResultsAria")}>
                {filteredTopicsForPalette.length === 0 ? (
                  <div className="chat-topic-palette-empty">{t("chat.topicPaletteEmpty")}</div>
                ) : (
                  filteredTopicsForPalette.map((topic, index) => {
                    const isActive = topic.id === activeTopicId;
                    const unread = getTopicUnreadCount(topic);
                    const selected = index === topicPaletteSelectedIndex;

                    return (
                      <Button
                        key={topic.id}
                        id={`chat-topic-option-${topic.id}`}
                        type="button"
                        className={`secondary chat-topic-palette-item ${selected ? "chat-topic-palette-item-selected" : ""}`}
                        role="option"
                        aria-selected={selected}
                        aria-current={isActive ? "true" : undefined}
                        onMouseEnter={() => setTopicPaletteSelectedIndex(index)}
                        onClick={() => selectTopicFromPalette(topic.id)}
                      >
                        <span className="chat-topic-palette-item-title-wrap">
                          {topic.isPinned ? <span className="chat-topic-palette-item-pin">{t("chat.topicPinnedBadge")}</span> : null}
                          <span className="chat-topic-palette-item-title">{topic.title}</span>
                        </span>
                        {unread > 0 ? <span className="chat-topic-palette-item-unread">{unread}</span> : null}
                      </Button>
                    );
                  })
                )}
              </div>
            </section>
          </div>,
          document.body
        )
        : null}
      {topicContextMenu && typeof document !== "undefined"
        ? createPortal(
          <TopicContextMenu
            t={t}
            x={topicContextMenu.x}
            y={topicContextMenu.y}
            archived={Boolean(topics.find((topic) => topic.id === topicContextMenu.topicId)?.archivedAt)}
            saving={editingTopicSaving || Boolean(archivingTopicId) || notificationSaving}
            renameValue={editingTopicTitle}
            onRenameValueChange={setEditingTopicTitle}
            renameEditing={isEditingTopicTitleInline}
            onStartRename={onStartTopicRenameInline}
            onApplyRename={applyTopicRename}
            onCancelRename={onCancelTopicRenameInline}
            onRunAction={runTopicMenuAction}
            activeMutePreset={topicMutePresetById[String(topicContextMenu.topicId || "").trim()] || null}
            onSetTopicMutePreset={setTopicMutePreset}
          />,
          document.body
        )
        : null}
      {topicDeleteConfirm && typeof document !== "undefined"
        ? createPortal(
          <div
            className="settings-confirm-overlay"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setTopicDeleteConfirm(null);
              }
            }}
          >
            <div className="card compact settings-confirm-modal w-full max-w-[420px]">
              <h3 className="subheading settings-confirm-title">{t("chat.deleteTopic")}</h3>
              <p className="muted settings-confirm-text">
                {t("chat.deleteTopicConfirm")}
                {" "}
                <strong>{topicDeleteConfirm.title}</strong>
              </p>
              <div className="delete-confirm-actions flex flex-wrap items-center gap-3">
                <Button type="button" className="secondary" onClick={() => setTopicDeleteConfirm(null)} disabled={editingTopicSaving}>
                  {t("common.no")}
                </Button>
                <Button type="button" className="delete-confirm-btn" onClick={() => void confirmDeleteTopic()} disabled={editingTopicSaving}>
                  {t("common.yes")}
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )
        : null}
    </>
  );
}