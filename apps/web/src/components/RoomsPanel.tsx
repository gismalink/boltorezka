import { useEffect, useRef, useState } from "react";
import type { Room, RoomKind } from "../domain";
import { PopupPortal } from "./PopupPortal";
import type { RoomsPanelProps } from "./types";

type ConfirmPopupState =
  | { kind: "archive-channel"; room: Room }
  | { kind: "clear-channel"; room: Room }
  | { kind: "delete-category" }
  | null;

const ROOM_KIND_ICON_CLASS: Record<RoomKind, string> = {
  text: "bi-hash",
  text_voice: "bi-broadcast",
  text_voice_video: "bi-camera-video"
};

export function RoomsPanel({
  t,
  canCreateRooms,
  roomsTree,
  roomSlug,
  currentUserId,
  currentUserName,
  liveRoomMembersBySlug,
  liveRoomMemberDetailsBySlug,
  voiceMicStateByUserIdInCurrentRoom,
  voiceAudioOutputMutedByUserIdInCurrentRoom,
  voiceRtcStateByUserIdInCurrentRoom,
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
  onToggleCategoryCollapsed,
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

  const dedupeMemberNames = (names: string[]) => {
    const byKey = new Map<string, string>();
    names.forEach((nameRaw) => {
      const normalized = String(nameRaw || "").trim();
      if (!normalized) {
        return;
      }

      const key = normalized.toLocaleLowerCase();
      if (!byKey.has(key)) {
        byKey.set(key, normalized);
      }
    });

    return Array.from(byKey.values());
  };

  const normalizedCurrentUserName = String(currentUserName || "").trim().toLocaleLowerCase();
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

    return dedupeMemberNames(liveRoomMembersBySlug[slug] || []).map((userName) => ({
      userId: "",
      userName
    }));
  };

  const renderRoomRow = (room: Room) => (
    <div className="channel-row relative grid grid-cols-[1fr_auto] items-center gap-2">
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
            data-tooltip={t("rooms.configChannel")}
            aria-label={t("rooms.configChannel")}
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
              <form className="grid gap-4" onSubmit={onSaveChannelSettings}>
                <h3 className="subheading">{t("rooms.channelSettings")}</h3>
                <input value={editingRoomTitle} onChange={(event) => onSetEditingRoomTitle(event.target.value)} placeholder={t("rooms.channelTitle")} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <select value={editingRoomKind} onChange={(event) => onSetEditingRoomKind(event.target.value as RoomKind)}>
                    <option value="text">{t("rooms.text")}</option>
                    <option value="text_voice">{t("rooms.textVoice")}</option>
                    <option value="text_voice_video">{t("rooms.textVoiceVideo")}</option>
                  </select>
                  <select value={editingRoomCategoryId} onChange={(event) => onSetEditingRoomCategoryId(event.target.value)}>
                    <option value="none">{t("rooms.noCategory")}</option>
                    {(roomsTree?.categories || []).map((category) => (
                      <option key={category.id} value={category.id}>{category.title}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" className="secondary" onClick={() => onMoveChannel("up")}>
                    <i className="bi bi-arrow-up" aria-hidden="true" /> {t("rooms.up")}
                  </button>
                  <button type="button" className="secondary" onClick={() => onMoveChannel("down")}>
                    <i className="bi bi-arrow-down" aria-hidden="true" /> {t("rooms.down")}
                  </button>
                </div>
                <button type="submit" className="icon-action"><i className="bi bi-check2" aria-hidden="true" /> {t("rooms.save")}</button>
                <button
                  type="button"
                  className="secondary clear-action-btn"
                  onClick={() => setConfirmPopup({ kind: "clear-channel", room })}
                >
                  <i className="bi bi-eraser" aria-hidden="true" /> {t("rooms.clearChat")}
                </button>
                <button
                  type="button"
                  className="secondary delete-action-btn"
                  onClick={() => setConfirmPopup({ kind: "archive-channel", room })}
                >
                  <i className="bi bi-archive" aria-hidden="true" /> {t("rooms.archiveChannel")}
                </button>
              </form>
            </div>
          </PopupPortal>
        </div>
      ) : null}

      {(() => {
        const roomMembers = mapRoomMembers(room.slug);

        if (roomMembers.length === 0) {
          return null;
        }

        const roomHasVoiceState = room.slug === roomSlug;

        return (
        <ul className="channel-members-list col-span-full grid gap-0.5 pl-4 pt-0.5">
          {roomMembers.map((member) => (
            (() => {
              const normalizedMemberName = member.userName.trim().toLocaleLowerCase();
              const isCurrentUser = normalizedCurrentUserId
                ? member.userId && member.userId === normalizedCurrentUserId
                : normalizedCurrentUserName && normalizedMemberName === normalizedCurrentUserName;
              const micState = roomHasVoiceState && member.userId
                ? (voiceMicStateByUserIdInCurrentRoom[member.userId] || "muted")
                : "muted";
              const isVoiceActive = micState === "speaking";
              const isAudioOutputMuted = roomHasVoiceState && member.userId
                ? Boolean(voiceAudioOutputMutedByUserIdInCurrentRoom[member.userId])
                : false;
              const rtcState = roomHasVoiceState && member.userId
                ? (voiceRtcStateByUserIdInCurrentRoom[member.userId] || "disconnected")
                : "disconnected";
              const micIconClass = micState === "muted"
                ? "bi-mic-mute"
                : micState === "speaking"
                  ? "bi-mic-fill"
                  : "bi-mic";
              const audioIconClass = isAudioOutputMuted ? "bi-headset-vr" : "bi-headphones";
              const rtcStateLabel = rtcState === "connected"
                ? t("rtc.connected")
                : rtcState === "connecting"
                  ? t("rtc.connecting")
                  : "";
              const rtcStateClass = rtcState === "connecting"
                ? "text-[#ffd166]"
                : rtcState === "connected"
                  ? "text-[var(--pixel-success)]"
                  : "";

              return (
            <li
              key={`${room.id}-${member.userId || member.userName}`}
              className={`channel-member-item grid min-h-[22px] grid-cols-[auto_1fr_auto_auto] items-center gap-1.5 ${isCurrentUser ? "channel-member-item-current" : ""} ${isVoiceActive ? "channel-member-item-voice-active" : ""}`}
            >
              <span className="channel-member-avatar">{(member.userName || "U").charAt(0).toUpperCase()}</span>
              <span className="channel-member-name">{member.userName}</span>
              {rtcState !== "disconnected" ? (
                <span className={`channel-member-rtc ${rtcStateClass}`}>{rtcStateLabel}</span>
              ) : null}
              <span className="channel-member-icons" aria-hidden="true">
                <i className={`bi ${micIconClass}`} />
                <i className={`bi ${audioIconClass}`} />
              </span>
            </li>
              );
            })()
          ))}
        </ul>
        );
      })()}
    </div>
  );

  return (
    <>
      <section className="card compact rooms-card flex min-h-0 flex-1 flex-col">
      <div className="section-heading-row mb-3 flex items-center justify-between gap-3">
        <h2>{t("rooms.title")}</h2>
        {canCreateRooms ? (
          <div className="row-actions flex items-center gap-2">
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
                    <div className="grid gap-3 sm:grid-cols-2">
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
          </div>
        ) : null}
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

      {confirmPopup ? (
        <div
          className="settings-confirm-overlay popup-layer-content fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setConfirmPopup(null);
            }
          }}
        >
          <div className="card compact settings-confirm-modal popup-layer-content w-full max-w-[420px]">
            <h3 className="subheading settings-confirm-title">{t("rooms.confirmTitle")}</h3>
            <p className="muted settings-confirm-text">
              {confirmPopup.kind === "clear-channel"
                ? t("rooms.confirmClear")
                : confirmPopup.kind === "archive-channel"
                  ? t("rooms.confirmArchiveChannel")
                  : t("rooms.confirmDeleteCategory")}
            </p>
            <div className="delete-confirm-actions flex flex-wrap items-center gap-3">
              <button type="button" className="secondary" onClick={() => setConfirmPopup(null)}>
                {t("common.no")}
              </button>
              <button
                type="button"
                className={confirmPopup.kind === "clear-channel" ? "clear-confirm-btn" : "delete-confirm-btn"}
                onClick={submitConfirmPopup}
              >
                {t("common.yes")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
