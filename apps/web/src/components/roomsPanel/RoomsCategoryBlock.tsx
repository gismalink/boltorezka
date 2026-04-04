import { memo, useRef } from "react";
import type { Room, RoomCategory } from "../../domain";
import { Button, PopupPortal } from "../uicomponents";
import type { RoomsPanelProps } from "../types";

type RoomsCategoryBlockProps = Pick<
  RoomsPanelProps,
  | "t"
  | "canCreateRooms"
  | "collapsedCategoryIds"
  | "categorySettingsPopupOpenId"
  | "editingCategoryTitle"
  | "onToggleCategoryCollapsed"
  | "onOpenCreateChannelPopup"
  | "onOpenCategorySettingsPopup"
  | "onSetEditingCategoryTitle"
  | "onSaveCategorySettings"
  | "onMoveCategory"
> & {
  category: RoomCategory & { channels: Room[] };
  unreadCountUnmuted: number;
  unreadCountMuted: number;
  renderRoomRow: (room: Room) => JSX.Element;
  onRequestDeleteCategory: () => void;
};

function RoomsCategoryBlockInner({
  t,
  canCreateRooms,
  collapsedCategoryIds,
  categorySettingsPopupOpenId,
  editingCategoryTitle,
  onToggleCategoryCollapsed,
  onOpenCreateChannelPopup,
  onOpenCategorySettingsPopup,
  onSetEditingCategoryTitle,
  onSaveCategorySettings,
  onMoveCategory,
  unreadCountUnmuted,
  unreadCountMuted,
  category,
  renderRoomRow,
  onRequestDeleteCategory
}: RoomsCategoryBlockProps) {
  const categorySettingsAnchorRef = useRef<HTMLDivElement>(null);
  const isCollapsed = collapsedCategoryIds.includes(category.id);
  const categoryActionsVariant = canCreateRooms ? "two" : "none";
  const categoryActionsOpen = categorySettingsPopupOpenId === category.id;

  return (
    <div className="mt-[var(--space-md)]">
      <div className={`rooms-row-shell category-title-row category-title-row-actions-${categoryActionsVariant} mb-[var(--space-xs)] flex items-center gap-2 rounded-[var(--radius-sm)] py-1 hover:bg-[var(--pixel-panel)]/55`}>
        <Button
          type="button"
          className={`secondary category-main-btn category-main-btn-actions-${categoryActionsVariant} inline-flex items-center gap-[var(--space-xs)] border-0 bg-transparent p-0 shadow-none hover:translate-x-0 hover:translate-y-0 hover:shadow-none active:translate-x-0 active:translate-y-0 active:shadow-none focus-visible:shadow-none`}
          onClick={() => onToggleCategoryCollapsed(category.id)}
          aria-label={isCollapsed ? t("rooms.expandCategory") : t("rooms.collapseCategory")}
        >
          <i className={`bi ${isCollapsed ? "bi-chevron-right" : "bi-chevron-down"}`} aria-hidden="true" />
          <span className="category-rooms-count rounded-full border border-[var(--pixel-border)] px-2 py-0.5 text-[11px] text-[var(--pixel-muted)]">
            {category.channels.length}
          </span>
          <span className="text-[var(--font-size-sm)] uppercase tracking-[0.04em] text-[var(--pixel-muted)]">{category.title}</span>
        </Button>
        <div className={`category-right-zone category-right-zone-actions-${categoryActionsVariant} ${categoryActionsOpen ? "category-right-zone-open" : ""}`}>
          {unreadCountMuted > 0 ? (
            <span className="room-unread-badge category-group-unread room-unread-badge-muted">{unreadCountMuted}</span>
          ) : null}
          {unreadCountUnmuted > 0 ? (
            <span className="room-unread-badge category-group-unread">{unreadCountUnmuted}</span>
          ) : null}
        {canCreateRooms ? (
          <div className={`category-actions category-actions-actions-${categoryActionsVariant} inline-flex items-center gap-1 ${categoryActionsOpen ? "category-actions-open" : ""}`}>
            <Button
              type="button"
              className="secondary icon-btn tiny category-action-btn"
              aria-label={t("rooms.createChannel")}
              data-tooltip={t("rooms.createChannel")}
              onClick={() => onOpenCreateChannelPopup(category.id)}
            >
              <i className="bi bi-plus-lg" aria-hidden="true" />
            </Button>
            <div className="category-settings-anchor" ref={categorySettingsAnchorRef}>
              <Button
                type="button"
                className="secondary icon-btn tiny category-action-btn"
                aria-label={t("rooms.configCategory")}
                data-tooltip={t("rooms.configCategory")}
                onClick={() => onOpenCategorySettingsPopup(category.id, category.title)}
              >
                <i className="bi bi-gear" aria-hidden="true" />
              </Button>
              <PopupPortal
                open={categorySettingsPopupOpenId === category.id}
                anchorRef={categorySettingsAnchorRef}
                className="settings-popup category-settings-popup"
                placement="bottom-end"
              >
                <div>
                  <form className="grid gap-4" onSubmit={onSaveCategorySettings}>
                    <h3 className="subheading">{t("rooms.categorySettings")}</h3>
                    <input value={editingCategoryTitle} onChange={(event) => onSetEditingCategoryTitle(event.target.value)} placeholder={t("rooms.categoryTitle")} />
                    <div className="flex flex-wrap items-center gap-3">
                      <Button type="button" className="secondary" onClick={() => onMoveCategory("up")}>
                        <i className="bi bi-arrow-up" aria-hidden="true" /> {t("rooms.up")}
                      </Button>
                      <Button type="button" className="secondary" onClick={() => onMoveCategory("down")}>
                        <i className="bi bi-arrow-down" aria-hidden="true" /> {t("rooms.down")}
                      </Button>
                    </div>
                    <Button type="submit" className="icon-action"><i className="bi bi-check2" aria-hidden="true" /> {t("rooms.save")}</Button>
                    <Button
                      type="button"
                      className="secondary delete-action-btn"
                      onClick={onRequestDeleteCategory}
                    >
                      <i className="bi bi-trash3" aria-hidden="true" /> {t("rooms.deleteCategory")}
                    </Button>
                  </form>
                </div>
              </PopupPortal>
            </div>
          </div>
        ) : null}
        </div>
      </div>
      {!isCollapsed ? (
        <ul className="rooms-list">
          {category.channels.map((room) => (
            <li key={room.id}>{renderRoomRow(room)}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export const RoomsCategoryBlock = memo(RoomsCategoryBlockInner);
