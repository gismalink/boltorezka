import type { RoomKind } from "../../domain";
import { PopupPortal } from "../uicomponents";
import type { RoomsPanelProps } from "../types";

type RoomsPanelHeaderProps = Pick<
  RoomsPanelProps,
  | "t"
  | "canCreateRooms"
  | "roomsTree"
  | "newCategoryTitle"
  | "categoryPopupOpen"
  | "newRoomTitle"
  | "newRoomKind"
  | "newRoomCategoryId"
  | "channelPopupOpen"
  | "categoryPopupRef"
  | "channelPopupRef"
  | "onSetCategoryPopupOpen"
  | "onSetChannelPopupOpen"
  | "onSetNewCategoryTitle"
  | "onSetNewRoomTitle"
  | "onSetNewRoomKind"
  | "onSetNewRoomCategoryId"
  | "onCreateCategory"
  | "onCreateRoom"
>;

export function RoomsPanelHeader({
  t,
  canCreateRooms,
  roomsTree,
  newCategoryTitle,
  categoryPopupOpen,
  newRoomTitle,
  newRoomKind,
  newRoomCategoryId,
  channelPopupOpen,
  categoryPopupRef,
  channelPopupRef,
  onSetCategoryPopupOpen,
  onSetChannelPopupOpen,
  onSetNewCategoryTitle,
  onSetNewRoomTitle,
  onSetNewRoomKind,
  onSetNewRoomCategoryId,
  onCreateCategory,
  onCreateRoom
}: RoomsPanelHeaderProps) {
  return (
    <div className="section-heading-row mb-3 flex items-center justify-between gap-3">
      <h2>{t("rooms.title")}</h2>
      <div className="row-actions flex items-center gap-2">
        {canCreateRooms ? (
          <>
            <div className="popup-anchor" ref={categoryPopupRef}>
              <button
                type="button"
                className="secondary icon-btn"
                aria-label={t("rooms.createCategory")}
                data-tooltip={t("rooms.createCategory")}
                onClick={() => {
                  onSetChannelPopupOpen(false);
                  onSetCategoryPopupOpen(!categoryPopupOpen);
                }}
              >
                <i className="bi bi-folder-plus" aria-hidden="true" />
              </button>
              <PopupPortal open={categoryPopupOpen} anchorRef={categoryPopupRef} className="settings-popup" placement="bottom-end">
                <div>
                  <form className="grid gap-4" onSubmit={onCreateCategory}>
                    <h3 className="subheading">{t("rooms.createCategoryTitle")}</h3>
                    <input value={newCategoryTitle} onChange={(event) => onSetNewCategoryTitle(event.target.value)} placeholder={t("rooms.categoryTitle")} />
                    <button type="submit" className="icon-action"><i className="bi bi-check2" aria-hidden="true" /> {t("rooms.save")}</button>
                  </form>
                </div>
              </PopupPortal>
            </div>

            <div className="popup-anchor" ref={channelPopupRef}>
              <button
                type="button"
                className="secondary icon-btn"
                aria-label={t("rooms.createChannel")}
                data-tooltip={t("rooms.createChannel")}
                onClick={() => {
                  onSetCategoryPopupOpen(false);
                  onSetChannelPopupOpen(!channelPopupOpen);
                }}
              >
                <i className="bi bi-plus-lg" aria-hidden="true" />
              </button>
              <PopupPortal open={channelPopupOpen} anchorRef={channelPopupRef} className="settings-popup" placement="bottom-end">
                <div>
                  <form className="grid gap-4" onSubmit={onCreateRoom}>
                    <h3 className="subheading">{t("rooms.createChannelTitle")}</h3>
                    <input value={newRoomTitle} onChange={(event) => onSetNewRoomTitle(event.target.value)} placeholder={t("rooms.channelTitle")} />
                    <div className="grid gap-3 desktop:grid-cols-2">
                      <select value={newRoomKind} onChange={(event) => onSetNewRoomKind(event.target.value as RoomKind)}>
                        <option value="text">{t("rooms.text")}</option>
                        <option value="text_voice">{t("rooms.textVoice")}</option>
                        <option value="text_voice_video">{t("rooms.textVoiceVideo")}</option>
                      </select>
                      <select value={newRoomCategoryId} onChange={(event) => onSetNewRoomCategoryId(event.target.value)}>
                        <option value="none">{t("rooms.noCategory")}</option>
                        {(roomsTree?.categories || []).map((category) => (
                          <option key={category.id} value={category.id}>{category.title}</option>
                        ))}
                      </select>
                    </div>
                    <button type="submit" className="icon-action"><i className="bi bi-check2" aria-hidden="true" /> {t("rooms.save")}</button>
                  </form>
                </div>
              </PopupPortal>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
