import { useRef } from "react";
import type { Room, RoomCategory } from "../../domain";
import { PopupPortal } from "../PopupPortal";
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
  renderRoomRow: (room: Room) => JSX.Element;
  onRequestDeleteCategory: () => void;
};

export function RoomsCategoryBlock({
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
  category,
  renderRoomRow,
  onRequestDeleteCategory
}: RoomsCategoryBlockProps) {
  const categorySettingsAnchorRef = useRef<HTMLDivElement>(null);
  const isCollapsed = collapsedCategoryIds.includes(category.id);

  return (
    <div className="category-block">
      <div className="category-title-row flex items-center justify-between gap-2">
        <button
          type="button"
          className="secondary category-collapse-btn"
          onClick={() => onToggleCategoryCollapsed(category.id)}
          aria-label={isCollapsed ? t("rooms.expandCategory") : t("rooms.collapseCategory")}
        >
          <i className={`bi ${isCollapsed ? "bi-chevron-right" : "bi-chevron-down"}`} aria-hidden="true" />
          <span className="category-title">{category.title}</span>
        </button>
        {canCreateRooms ? (
          <div className="category-actions inline-flex items-center gap-1">
            <button
              type="button"
              className="secondary icon-btn tiny category-action-btn"
              aria-label={t("rooms.createChannel")}
              data-tooltip={t("rooms.createChannel")}
              onClick={() => onOpenCreateChannelPopup(category.id)}
            >
              <i className="bi bi-plus-lg" aria-hidden="true" />
            </button>
            <div className="category-settings-anchor" ref={categorySettingsAnchorRef}>
              <button
                type="button"
                className="secondary icon-btn tiny category-action-btn"
                aria-label={t("rooms.configCategory")}
                data-tooltip={t("rooms.configCategory")}
                onClick={() => onOpenCategorySettingsPopup(category.id, category.title)}
              >
                <i className="bi bi-gear" aria-hidden="true" />
              </button>
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
                      <button type="button" className="secondary" onClick={() => onMoveCategory("up")}>
                        <i className="bi bi-arrow-up" aria-hidden="true" /> {t("rooms.up")}
                      </button>
                      <button type="button" className="secondary" onClick={() => onMoveCategory("down")}>
                        <i className="bi bi-arrow-down" aria-hidden="true" /> {t("rooms.down")}
                      </button>
                    </div>
                    <button type="submit" className="icon-action"><i className="bi bi-check2" aria-hidden="true" /> {t("rooms.save")}</button>
                    <button
                      type="button"
                      className="secondary delete-action-btn"
                      onClick={onRequestDeleteCategory}
                    >
                      <i className="bi bi-trash3" aria-hidden="true" /> {t("rooms.deleteCategory")}
                    </button>
                  </form>
                </div>
              </PopupPortal>
            </div>
          </div>
        ) : null}
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
