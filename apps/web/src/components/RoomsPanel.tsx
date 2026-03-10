import { useEffect, useRef, useState } from "react";
import type { Room, RoomKind } from "../domain";
import { PopupPortal } from "./PopupPortal";
import { RoomRow } from "./roomsPanel/RoomRow";
import { RoomsConfirmOverlay } from "./roomsPanel/RoomsConfirmOverlay";
import type { RoomsPanelProps } from "./types";

type ConfirmPopupState =
  | { kind: "archive-channel"; room: Room }
  | { kind: "clear-channel"; room: Room }
  | { kind: "delete-category" }
  | null;

export function RoomsPanel({
  t,
  canCreateRooms,
  canKickMembers,
  canManageAudioQuality,
  roomsTree,
  roomSlug,
  roomMediaTopologyBySlug,
  currentUserId,
  liveRoomMembersBySlug,
  liveRoomMemberDetailsBySlug,
  voiceMicStateByUserIdInCurrentRoom,
  voiceCameraEnabledByUserIdInCurrentRoom,
  voiceAudioOutputMutedByUserIdInCurrentRoom,
  voiceRtcStateByUserIdInCurrentRoom,
  voiceMediaStatusSummaryByUserIdInCurrentRoom,
  collapsedCategoryIds,
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
  editingRoomAudioQualitySetting,
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
  onSetEditingRoomAudioQualitySetting,
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
  onToggleCategoryCollapsed,
  onJoinRoom,
  onKickRoomMember
}: RoomsPanelProps) {
  const categorySettingsAnchorRefs = useRef<Record<string, HTMLDivElement | null>>({});
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

  useEffect(() => {
    if (!confirmPopup) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setConfirmPopup(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [confirmPopup]);

  const normalizedCurrentUserId = String(currentUserId || "").trim();
  const mapRoomMembers = (slug: string) => {
    const details = liveRoomMemberDetailsBySlug[slug] || [];
    if (details.length > 0) {
      const byKey = new Map<string, { userId: string; userName: string }>();
      details.forEach((member) => {
        const userId = String(member.userId || "").trim();
        const userName = String(member.userName || member.userId || "").trim();
        if (!userName) {
          return;
        }

        const key = userId || userName.toLocaleLowerCase();
        if (!byKey.has(key)) {
          byKey.set(key, { userId, userName });
        }
      });

      return Array.from(byKey.values());
    }

    return (liveRoomMembersBySlug[slug] || []).map((nameRaw) => {
      const userName = String(nameRaw || "").trim();
      return {
      userId: "",
      userName
      };
    }).filter((member) => member.userName.length > 0);
  };

  const renderRoomRow = (room: Room) => (
    <RoomRow
      t={t}
      canCreateRooms={canCreateRooms}
      canKickMembers={canKickMembers}
      canManageAudioQuality={canManageAudioQuality}
      roomsTree={roomsTree}
      roomSlug={roomSlug}
      voiceMicStateByUserIdInCurrentRoom={voiceMicStateByUserIdInCurrentRoom}
      voiceCameraEnabledByUserIdInCurrentRoom={voiceCameraEnabledByUserIdInCurrentRoom}
      voiceAudioOutputMutedByUserIdInCurrentRoom={voiceAudioOutputMutedByUserIdInCurrentRoom}
      voiceRtcStateByUserIdInCurrentRoom={voiceRtcStateByUserIdInCurrentRoom}
      voiceMediaStatusSummaryByUserIdInCurrentRoom={voiceMediaStatusSummaryByUserIdInCurrentRoom}
      channelSettingsPopupOpenId={channelSettingsPopupOpenId}
      editingRoomTitle={editingRoomTitle}
      editingRoomKind={editingRoomKind}
      editingRoomCategoryId={editingRoomCategoryId}
      editingRoomAudioQualitySetting={editingRoomAudioQualitySetting}
      onSetEditingRoomTitle={onSetEditingRoomTitle}
      onSetEditingRoomKind={onSetEditingRoomKind}
      onSetEditingRoomCategoryId={onSetEditingRoomCategoryId}
      onSetEditingRoomAudioQualitySetting={onSetEditingRoomAudioQualitySetting}
      onSaveChannelSettings={onSaveChannelSettings}
      onMoveChannel={onMoveChannel}
      onOpenChannelSettingsPopup={onOpenChannelSettingsPopup}
      onJoinRoom={onJoinRoom}
      onKickRoomMember={onKickRoomMember}
      room={room}
      roomMembers={mapRoomMembers(room.slug)}
      normalizedCurrentUserId={normalizedCurrentUserId}
      onRequestClearChannel={(targetRoom) => setConfirmPopup({ kind: "clear-channel", room: targetRoom })}
      onRequestArchiveChannel={(targetRoom) => setConfirmPopup({ kind: "archive-channel", room: targetRoom })}
    />
  );

  return (
    <>
      <section className="card compact rooms-card flex min-h-0 flex-1 flex-col">
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
                      <input value={newCategorySlug} onChange={(event) => onSetNewCategorySlug(event.target.value)} placeholder={t("rooms.categorySlug")} />
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
                      <input value={newRoomSlug} onChange={(event) => onSetNewRoomSlug(event.target.value)} placeholder={t("rooms.channelSlug")} />
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
      <div className="rooms-scroll min-h-0 flex-1 overflow-y-auto">
        {(roomsTree?.categories || []).map((category) => (
          <div key={category.id} className="category-block">
            <div className="category-title-row flex items-center justify-between gap-2">
              <button
                type="button"
                className="secondary category-collapse-btn"
                onClick={() => onToggleCategoryCollapsed(category.id)}
                aria-label={collapsedCategoryIds.includes(category.id) ? t("rooms.expandCategory") : t("rooms.collapseCategory")}
              >
                <i className={`bi ${collapsedCategoryIds.includes(category.id) ? "bi-chevron-right" : "bi-chevron-down"}`} aria-hidden="true" />
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
                  <div
                    className="category-settings-anchor"
                    ref={(node) => {
                      categorySettingsAnchorRefs.current[category.id] = node;
                    }}
                  >
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
                      anchorRef={{ current: categorySettingsAnchorRefs.current[category.id] }}
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
                            onClick={() => setConfirmPopup({ kind: "delete-category" })}
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
            {!collapsedCategoryIds.includes(category.id) ? (
              <ul className="rooms-list">
                {category.channels.map((room) => (
                  <li key={room.id}>{renderRoomRow(room)}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}

        {uncategorizedRooms.length > 0 ? (
          <div className="category-block">
            <div className="category-title">{t("rooms.uncategorized")}</div>
            <ul className="rooms-list">
              {uncategorizedRooms.map((room) => (
                <li key={room.id}>{renderRoomRow(room)}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      </section>

      <RoomsConfirmOverlay
        t={t}
        kind={confirmPopup?.kind || null}
        onClose={() => setConfirmPopup(null)}
        onConfirm={submitConfirmPopup}
      />
    </>
  );
}
