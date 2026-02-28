import { useEffect, useRef, useState } from "react";
import type { Room, RoomKind } from "../types";
import { PopupPortal } from "./PopupPortal";
import type { RoomsPanelProps } from "./types";

type ConfirmPopupState =
  | { kind: "delete-channel"; room: Room }
  | { kind: "clear-channel"; room: Room }
  | { kind: "delete-category" }
  | null;

const ROOM_KIND_ICON_CLASS: Record<RoomKind, string> = {
  text: "bi-hash",
  text_voice: "bi-broadcast",
  text_voice_video: "bi-camera-video"
};

export function RoomsPanel({
  canCreateRooms,
  roomsTree,
  roomSlug,
  uncategorizedRooms,
  newCategorySlug,
  newCategoryTitle,
  categoryPopupOpen,
  newRoomSlug,
  newRoomTitle,
  newRoomKind,
  newRoomCategoryId,
  channelPopupOpen,
  categorySettingsPopupOpenId,
  editingCategoryTitle,
  channelSettingsPopupOpenId,
  editingRoomTitle,
  editingRoomKind,
  editingRoomCategoryId,
  categoryPopupRef,
  channelPopupRef,
  onSetCategoryPopupOpen,
  onSetChannelPopupOpen,
  onSetNewCategorySlug,
  onSetNewCategoryTitle,
  onSetNewRoomSlug,
  onSetNewRoomTitle,
  onSetNewRoomKind,
  onSetNewRoomCategoryId,
  onSetEditingCategoryTitle,
  onSetEditingRoomTitle,
  onSetEditingRoomKind,
  onSetEditingRoomCategoryId,
  onCreateCategory,
  onCreateRoom,
  onOpenCreateChannelPopup,
  onOpenCategorySettingsPopup,
  onOpenChannelSettingsPopup,
  onSaveCategorySettings,
  onMoveCategory,
  onDeleteCategory,
  onSaveChannelSettings,
  onMoveChannel,
  onClearChannelMessages,
  onDeleteChannel,
  onJoinRoom
}: RoomsPanelProps) {
  const categorySettingsAnchorRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const channelSettingsAnchorRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [confirmPopup, setConfirmPopup] = useState<ConfirmPopupState>(null);

  useEffect(() => {
    if (!channelSettingsPopupOpenId && confirmPopup?.kind !== "delete-category") {
      setConfirmPopup(null);
    }
  }, [channelSettingsPopupOpenId, confirmPopup]);

  useEffect(() => {
    if (!categorySettingsPopupOpenId && confirmPopup?.kind === "delete-category") {
      setConfirmPopup(null);
    }
  }, [categorySettingsPopupOpenId, confirmPopup]);

  const submitConfirmPopup = () => {
    if (!confirmPopup) {
      return;
    }

    if (confirmPopup.kind === "delete-category") {
      onDeleteCategory();
      setConfirmPopup(null);
      return;
    }

    if (confirmPopup.kind === "clear-channel") {
      onClearChannelMessages(confirmPopup.room);
      setConfirmPopup(null);
      return;
    }

    onDeleteChannel(confirmPopup.room);
    setConfirmPopup(null);
  };

  const renderRoomRow = (room: Room) => (
    <div className="channel-row">
      <button
        className={`secondary room-btn ${roomSlug === room.slug ? "room-btn-active" : ""}`}
        onClick={() => {
          if (roomSlug !== room.slug) {
            onJoinRoom(room.slug);
          }
        }}
        disabled={roomSlug === room.slug}
      >
        <i className={`bi ${ROOM_KIND_ICON_CLASS[room.kind]}`} aria-hidden="true" />
        <span>{room.title}</span>
      </button>
      {canCreateRooms ? (
        <div
          className="channel-settings-anchor"
          ref={(node) => {
            channelSettingsAnchorRefs.current[room.id] = node;
          }}
        >
          <button
            type="button"
            className="secondary icon-btn tiny channel-action-btn"
            data-tooltip="Configure channel"
            aria-label="Configure channel"
            onClick={() => onOpenChannelSettingsPopup(room)}
          >
            <i className="bi bi-gear" aria-hidden="true" />
          </button>
          <PopupPortal
            open={channelSettingsPopupOpenId === room.id}
            anchorRef={{ current: channelSettingsAnchorRefs.current[room.id] }}
            className="settings-popup channel-settings-popup"
            placement="bottom-end"
          >
            <div>
              <form className="stack" onSubmit={onSaveChannelSettings}>
                <h3 className="subheading">Channel settings</h3>
                <input value={editingRoomTitle} onChange={(event) => onSetEditingRoomTitle(event.target.value)} placeholder="channel title" />
                <div className="row">
                  <select value={editingRoomKind} onChange={(event) => onSetEditingRoomKind(event.target.value as RoomKind)}>
                    <option value="text">Text</option>
                    <option value="text_voice">Text + Voice</option>
                    <option value="text_voice_video">Text + Voice + Video</option>
                  </select>
                  <select value={editingRoomCategoryId} onChange={(event) => onSetEditingRoomCategoryId(event.target.value)}>
                    <option value="none">No category</option>
                    {(roomsTree?.categories || []).map((category) => (
                      <option key={category.id} value={category.id}>{category.title}</option>
                    ))}
                  </select>
                </div>
                <div className="row">
                  <button type="button" className="secondary" onClick={() => onMoveChannel("up")}>
                    <i className="bi bi-arrow-up" aria-hidden="true" /> Up
                  </button>
                  <button type="button" className="secondary" onClick={() => onMoveChannel("down")}>
                    <i className="bi bi-arrow-down" aria-hidden="true" /> Down
                  </button>
                </div>
                <button type="submit" className="icon-action"><i className="bi bi-check2" aria-hidden="true" /> Save</button>
                <button
                  type="button"
                  className="secondary clear-action-btn"
                  onClick={() => setConfirmPopup({ kind: "clear-channel", room })}
                >
                  <i className="bi bi-eraser" aria-hidden="true" /> Clear chat
                </button>
                <button
                  type="button"
                  className="secondary delete-action-btn"
                  onClick={() => setConfirmPopup({ kind: "delete-channel", room })}
                >
                  <i className="bi bi-trash3" aria-hidden="true" /> Delete channel
                </button>
              </form>
            </div>
          </PopupPortal>
        </div>
      ) : null}
    </div>
  );

  return (
    <>
      <section className="card compact rooms-card">
      <div className="section-heading-row">
        <h2>Rooms</h2>
        {canCreateRooms ? (
          <div className="row-actions">
            <div className="popup-anchor" ref={categoryPopupRef}>
              <button
                type="button"
                className="secondary icon-btn"
                aria-label="Create category"
                data-tooltip="Create category"
                onClick={() => {
                  onSetChannelPopupOpen(false);
                  onSetCategoryPopupOpen(!categoryPopupOpen);
                }}
              >
                <i className="bi bi-folder-plus" aria-hidden="true" />
              </button>
              <PopupPortal open={categoryPopupOpen} anchorRef={categoryPopupRef} className="settings-popup" placement="bottom-end">
                <div>
                  <form className="stack" onSubmit={onCreateCategory}>
                    <h3 className="subheading">Create category</h3>
                    <input value={newCategorySlug} onChange={(event) => onSetNewCategorySlug(event.target.value)} placeholder="category slug" />
                    <input value={newCategoryTitle} onChange={(event) => onSetNewCategoryTitle(event.target.value)} placeholder="category title" />
                    <button type="submit" className="icon-action"><i className="bi bi-check2" aria-hidden="true" /> Save</button>
                  </form>
                </div>
              </PopupPortal>
            </div>

            <div className="popup-anchor" ref={channelPopupRef}>
              <button
                type="button"
                className="secondary icon-btn"
                aria-label="Create channel"
                data-tooltip="Create channel"
                onClick={() => {
                  onSetCategoryPopupOpen(false);
                  onSetChannelPopupOpen(!channelPopupOpen);
                }}
              >
                <i className="bi bi-plus-lg" aria-hidden="true" />
              </button>
              <PopupPortal open={channelPopupOpen} anchorRef={channelPopupRef} className="settings-popup" placement="bottom-end">
                <div>
                  <form className="stack" onSubmit={onCreateRoom}>
                    <h3 className="subheading">Create channel</h3>
                    <input value={newRoomSlug} onChange={(event) => onSetNewRoomSlug(event.target.value)} placeholder="channel slug" />
                    <input value={newRoomTitle} onChange={(event) => onSetNewRoomTitle(event.target.value)} placeholder="channel title" />
                    <div className="row">
                      <select value={newRoomKind} onChange={(event) => onSetNewRoomKind(event.target.value as RoomKind)}>
                        <option value="text">Text</option>
                        <option value="text_voice">Text + Voice</option>
                        <option value="text_voice_video">Text + Voice + Video</option>
                      </select>
                      <select value={newRoomCategoryId} onChange={(event) => onSetNewRoomCategoryId(event.target.value)}>
                        <option value="none">No category</option>
                        {(roomsTree?.categories || []).map((category) => (
                          <option key={category.id} value={category.id}>{category.title}</option>
                        ))}
                      </select>
                    </div>
                    <button type="submit" className="icon-action"><i className="bi bi-check2" aria-hidden="true" /> Save</button>
                  </form>
                </div>
              </PopupPortal>
            </div>
          </div>
        ) : null}
      </div>
      {canCreateRooms ? (
        <p className="muted compact-hint">Use icon buttons to create categories/channels.</p>
      ) : (
        <p className="muted">Only admin/super_admin can create rooms.</p>
      )}

      <div className="rooms-scroll">
        {(roomsTree?.categories || []).map((category) => (
          <div key={category.id} className="category-block">
            <div className="category-title-row">
              <div className="category-title">{category.title}</div>
              {canCreateRooms ? (
                <div className="category-actions">
                  <button
                    type="button"
                    className="secondary icon-btn tiny category-action-btn"
                    aria-label="Create channel in category"
                    data-tooltip="Create channel in category"
                    onClick={() => onOpenCreateChannelPopup(category.id)}
                  >
                    <i className="bi bi-plus-lg" aria-hidden="true" />
                  </button>
                  <div
                    className="category-settings-anchor"
                    ref={(node) => {
                      categorySettingsAnchorRefs.current[category.id] = node;
                    }}
                  >
                    <button
                      type="button"
                      className="secondary icon-btn tiny category-action-btn"
                      aria-label="Configure category"
                      data-tooltip="Configure category"
                      onClick={() => onOpenCategorySettingsPopup(category.id, category.title)}
                    >
                      <i className="bi bi-gear" aria-hidden="true" />
                    </button>
                    <PopupPortal
                      open={categorySettingsPopupOpenId === category.id}
                      anchorRef={{ current: categorySettingsAnchorRefs.current[category.id] }}
                      className="settings-popup category-settings-popup"
                      placement="bottom-end"
                    >
                      <div>
                        <form className="stack" onSubmit={onSaveCategorySettings}>
                          <h3 className="subheading">Category settings</h3>
                          <input value={editingCategoryTitle} onChange={(event) => onSetEditingCategoryTitle(event.target.value)} placeholder="category title" />
                          <div className="row">
                            <button type="button" className="secondary" onClick={() => onMoveCategory("up")}>
                              <i className="bi bi-arrow-up" aria-hidden="true" /> Up
                            </button>
                            <button type="button" className="secondary" onClick={() => onMoveCategory("down")}>
                              <i className="bi bi-arrow-down" aria-hidden="true" /> Down
                            </button>
                          </div>
                          <button type="submit" className="icon-action"><i className="bi bi-check2" aria-hidden="true" /> Save</button>
                          <button
                            type="button"
                            className="secondary delete-action-btn"
                            onClick={() => setConfirmPopup({ kind: "delete-category" })}
                          >
                            <i className="bi bi-trash3" aria-hidden="true" /> Delete category
                          </button>
                        </form>
                      </div>
                    </PopupPortal>
                  </div>
                </div>
              ) : null}
            </div>
            <ul className="rooms-list">
              {category.channels.map((room) => (
                <li key={room.id}>{renderRoomRow(room)}</li>
              ))}
            </ul>
          </div>
        ))}

        {uncategorizedRooms.length > 0 ? (
          <div className="category-block">
            <div className="category-title">Uncategorized</div>
            <ul className="rooms-list">
              {uncategorizedRooms.map((room) => (
                <li key={room.id}>{renderRoomRow(room)}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      </section>

      {confirmPopup ? (
        <div className="settings-confirm-overlay" onMouseDown={(event) => event.stopPropagation()}>
          <div className="card compact settings-confirm-modal">
            <h3 className="subheading settings-confirm-title">Confirm action</h3>
            <p className="muted settings-confirm-text">
              {confirmPopup.kind === "clear-channel"
                ? "Clear all messages in this chat?"
                : confirmPopup.kind === "delete-channel"
                  ? "Delete channel?"
                  : "Delete category?"}
            </p>
            <div className="row delete-confirm-actions">
              <button type="button" className="secondary" onClick={() => setConfirmPopup(null)}>
                No
              </button>
              <button
                type="button"
                className={confirmPopup.kind === "clear-channel" ? "clear-confirm-btn" : "delete-confirm-btn"}
                onClick={submitConfirmPopup}
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
