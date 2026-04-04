import { useEffect, useMemo, useState } from "react";
import type { Room } from "../domain";
import { Button } from "./uicomponents";
import { RoomsCategoryBlock } from "./roomsPanel/RoomsCategoryBlock";
import { RoomRow } from "./roomsPanel/RoomRow";
import { RoomsConfirmOverlay } from "./roomsPanel/RoomsConfirmOverlay";
import { RoomsPanelHeader } from "./roomsPanel/RoomsPanelHeader";
import { RoomsUncategorizedBlock } from "./roomsPanel/RoomsUncategorizedBlock";
import { mapRoomMembersForSlug } from "./roomsPanel/roomMembers";
import type { RoomsPanelProps } from "./types";

type ConfirmPopupState =
  | { kind: "archive-channel"; room: Room }
  | { kind: "clear-channel"; room: Room }
  | { kind: "restore-channel"; room: Room }
  | { kind: "delete-channel-permanent"; room: Room }
  | { kind: "delete-all-archived" }
  | { kind: "delete-category" }
  | null;

export function RoomsPanel({
  t,
  canCreateRooms,
  canKickMembers,
  canManageAudioQuality,
  roomsTree,
  roomSlug,
  activeChatRoomSlug,
  roomMediaTopologyBySlug,
  screenShareOwnerByRoomSlug,
  roomUnreadBySlug,
  serverUnreadCount,
  currentUserId,
  liveRoomMembersBySlug,
  liveRoomMemberDetailsBySlug,
  memberPreferencesByUserId,
  voiceMicStateByUserIdInCurrentRoom,
  voiceCameraEnabledByUserIdInCurrentRoom,
  voiceAudioOutputMutedByUserIdInCurrentRoom,
  audioMuted,
  voiceRtcStateByUserIdInCurrentRoom,
  voiceMediaStatusSummaryByUserIdInCurrentRoom,
  collapsedCategoryIds,
  uncategorizedRooms,
  archivedRooms,
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
  editingRoomNsfw,
  editingRoomHidden,
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
  onSetEditingRoomNsfw,
  onSetEditingRoomHidden,
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
  onRestoreChannel,
  onDeleteChannelPermanent,
  onToggleCategoryCollapsed,
  onJoinRoom,
  onOpenRoomChat,
  onKickRoomMember,
  onMoveRoomMember,
  onSaveMemberPreference,
  onLoadServerMemberProfile,
  onLoadServerRoles,
  onSetServerMemberCustomRoles,
  onSetServerMemberHiddenRoomAccess,
  onSetRoomNotificationMutePreset
}: RoomsPanelProps) {
  const [confirmPopup, setConfirmPopup] = useState<ConfirmPopupState>(null);

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

    if (confirmPopup.kind === "restore-channel") {
      onRestoreChannel(confirmPopup.room);
      setConfirmPopup(null);
      return;
    }

    if (confirmPopup.kind === "delete-channel-permanent") {
      onDeleteChannelPermanent(confirmPopup.room);
      setConfirmPopup(null);
      return;
    }

    if (confirmPopup.kind === "delete-all-archived") {
      const snapshot = [...archivedRooms];
      const run = async () => {
        for (const room of snapshot) {
          await Promise.resolve(onDeleteChannelPermanent(room));
        }
      };

      void run();
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

  const onlineOutsideRooms = useMemo(() => {
    const knownRoomSlugs = new Set<string>();

    (roomsTree?.categories || []).forEach((category) => {
      (category.rooms || []).forEach((room) => {
        const slug = String(room.slug || "").trim();
        if (slug) {
          knownRoomSlugs.add(slug);
        }
      });
    });

    uncategorizedRooms.forEach((room) => {
      const slug = String(room.slug || "").trim();
      if (slug) {
        knownRoomSlugs.add(slug);
      }
    });

    archivedRooms.forEach((room) => {
      const slug = String(room.slug || "").trim();
      if (slug) {
        knownRoomSlugs.add(slug);
      }
    });

    const nextById = new Map<string, { userId: string; userName: string }>();

    Object.entries(liveRoomMemberDetailsBySlug || {}).forEach(([slugRaw, members]) => {
      const slug = String(slugRaw || "").trim();
      if (!slug || knownRoomSlugs.has(slug)) {
        return;
      }

      (Array.isArray(members) ? members : []).forEach((member) => {
        const userId = String(member.userId || "").trim();
        const userName = String(member.userName || member.userId || "").trim();
        if (!userName) {
          return;
        }

        const key = userId || userName.toLowerCase();
        if (!nextById.has(key)) {
          nextById.set(key, { userId, userName });
        }
      });
    });

    return Array.from(nextById.values()).sort((a, b) => a.userName.localeCompare(b.userName));
  }, [roomsTree, uncategorizedRooms, archivedRooms, liveRoomMemberDetailsBySlug]);

  const renderRoomRow = (room: Room) => (
    <RoomRow
      t={t}
      canCreateRooms={canCreateRooms}
      canKickMembers={canKickMembers}
      canManageAudioQuality={canManageAudioQuality}
      roomsTree={roomsTree}
      roomSlug={roomSlug}
      activeChatRoomSlug={activeChatRoomSlug}
      screenShareOwnerByRoomSlug={screenShareOwnerByRoomSlug}
      voiceMicStateByUserIdInCurrentRoom={voiceMicStateByUserIdInCurrentRoom}
      voiceCameraEnabledByUserIdInCurrentRoom={voiceCameraEnabledByUserIdInCurrentRoom}
      voiceAudioOutputMutedByUserIdInCurrentRoom={voiceAudioOutputMutedByUserIdInCurrentRoom}
      audioMuted={audioMuted}
      voiceRtcStateByUserIdInCurrentRoom={voiceRtcStateByUserIdInCurrentRoom}
      voiceMediaStatusSummaryByUserIdInCurrentRoom={voiceMediaStatusSummaryByUserIdInCurrentRoom}
      channelSettingsPopupOpenId={channelSettingsPopupOpenId}
      editingRoomTitle={editingRoomTitle}
      editingRoomKind={editingRoomKind}
      editingRoomCategoryId={editingRoomCategoryId}
      editingRoomNsfw={editingRoomNsfw}
      editingRoomHidden={editingRoomHidden}
      editingRoomAudioQualitySetting={editingRoomAudioQualitySetting}
      onSetEditingRoomTitle={onSetEditingRoomTitle}
      onSetEditingRoomKind={onSetEditingRoomKind}
      onSetEditingRoomCategoryId={onSetEditingRoomCategoryId}
      onSetEditingRoomNsfw={onSetEditingRoomNsfw}
      onSetEditingRoomHidden={onSetEditingRoomHidden}
      onSetEditingRoomAudioQualitySetting={onSetEditingRoomAudioQualitySetting}
      onSaveChannelSettings={onSaveChannelSettings}
      onMoveChannel={onMoveChannel}
      onOpenChannelSettingsPopup={onOpenChannelSettingsPopup}
      onJoinRoom={onJoinRoom}
      onOpenRoomChat={onOpenRoomChat}
      onKickRoomMember={onKickRoomMember}
      onMoveRoomMember={onMoveRoomMember}
      onSaveMemberPreference={onSaveMemberPreference}
      onLoadServerMemberProfile={onLoadServerMemberProfile}
      onLoadServerRoles={onLoadServerRoles}
      onSetServerMemberCustomRoles={onSetServerMemberCustomRoles}
      onSetServerMemberHiddenRoomAccess={onSetServerMemberHiddenRoomAccess}
      onSetRoomNotificationMutePreset={onSetRoomNotificationMutePreset}
      memberPreferencesByUserId={memberPreferencesByUserId}
      room={room}
      roomUnreadCount={Math.max(0, Number(roomUnreadBySlug[room.slug] || 0))}
      roomMembers={mapRoomMembersForSlug(liveRoomMemberDetailsBySlug, liveRoomMembersBySlug, room.slug)}
      normalizedCurrentUserId={normalizedCurrentUserId}
      onRequestClearChannel={(targetRoom) => setConfirmPopup({ kind: "clear-channel", room: targetRoom })}
      onRequestArchiveChannel={(targetRoom) => setConfirmPopup({ kind: "archive-channel", room: targetRoom })}
    />
  );

  return (
    <>
      <section className="card compact rooms-card flex min-h-0 flex-1 flex-col">
      <RoomsPanelHeader
        t={t}
        canCreateRooms={canCreateRooms}
        roomsTree={roomsTree}
        newCategoryTitle={newCategoryTitle}
        categoryPopupOpen={categoryPopupOpen}
        newRoomTitle={newRoomTitle}
        newRoomKind={newRoomKind}
        newRoomCategoryId={newRoomCategoryId}
        channelPopupOpen={channelPopupOpen}
        categoryPopupRef={categoryPopupRef}
        channelPopupRef={channelPopupRef}
        onSetCategoryPopupOpen={onSetCategoryPopupOpen}
        onSetChannelPopupOpen={onSetChannelPopupOpen}
        onSetNewCategoryTitle={onSetNewCategoryTitle}
        onSetNewRoomTitle={onSetNewRoomTitle}
        onSetNewRoomKind={onSetNewRoomKind}
        onSetNewRoomCategoryId={onSetNewRoomCategoryId}
        onCreateCategory={onCreateCategory}
        onCreateRoom={onCreateRoom}
      />
      {serverUnreadCount > 0 ? (
        <div className="rooms-unread-summary">
          {t("rooms.unreadSummary").replace("{count}", String(serverUnreadCount))}
        </div>
      ) : null}
      <div className="rooms-scroll min-h-0 flex-1 overflow-y-auto">
        {(roomsTree?.categories || []).map((category) => (
          <RoomsCategoryBlock
            key={category.id}
            t={t}
            canCreateRooms={canCreateRooms}
            collapsedCategoryIds={collapsedCategoryIds}
            categorySettingsPopupOpenId={categorySettingsPopupOpenId}
            editingCategoryTitle={editingCategoryTitle}
            onToggleCategoryCollapsed={onToggleCategoryCollapsed}
            onOpenCreateChannelPopup={onOpenCreateChannelPopup}
            onOpenCategorySettingsPopup={onOpenCategorySettingsPopup}
            onSetEditingCategoryTitle={onSetEditingCategoryTitle}
            onSaveCategorySettings={onSaveCategorySettings}
            onMoveCategory={onMoveCategory}
            category={category}
            renderRoomRow={renderRoomRow}
            onRequestDeleteCategory={() => setConfirmPopup({ kind: "delete-category" })}
          />
        ))}

        <RoomsUncategorizedBlock t={t} rooms={uncategorizedRooms} renderRoomRow={renderRoomRow} />

        {onlineOutsideRooms.length > 0 ? (
          <div className="mt-[var(--space-md)]">
            <div className="mb-[var(--space-xs)] text-[var(--font-size-sm)] uppercase tracking-[0.04em] text-[var(--pixel-muted)]">
              {t("rooms.onlineOutsideRooms")}
            </div>
            <ul className="rooms-list">
              {onlineOutsideRooms.map((member) => (
                <li key={`outside-online:${member.userId || member.userName}`} className="channel-row grid grid-cols-[1fr] items-center gap-2">
                  <div className="secondary room-btn room-btn-interactive pointer-events-none opacity-85">
                    <i className="bi bi-circle-fill text-[10px] text-[var(--pixel-accent)]" aria-hidden="true" />
                    <span>{member.userName}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {canCreateRooms && archivedRooms.length > 0 ? (
          <div className="mt-[var(--space-md)]">
            <div className="mb-[var(--space-xs)] flex items-center justify-between gap-2">
              <div className="text-[var(--font-size-sm)] uppercase tracking-[0.04em] text-[var(--pixel-muted)]">
                {t("rooms.deletedGroup")}
              </div>
              <Button
                type="button"
                className="secondary icon-btn tiny delete-action-btn"
                onClick={() => setConfirmPopup({ kind: "delete-all-archived" })}
                aria-label={t("rooms.deleteAllDeleted")}
                data-tooltip={t("rooms.deleteAllDeleted")}
              >
                <i className="bi bi-trash3" aria-hidden="true" />
              </Button>
            </div>
            <ul className="rooms-list">
              {archivedRooms.map((room) => (
                <li key={room.id} className="channel-row grid grid-cols-[1fr_auto] items-center gap-2">
                  <div className="secondary room-btn room-btn-interactive pointer-events-none opacity-75">
                    <i className="bi bi-archive" aria-hidden="true" />
                    <span>{room.title}</span>
                  </div>
                  <div className="inline-flex items-center gap-1">
                    <Button
                      type="button"
                      className="secondary icon-btn tiny"
                      aria-label={t("rooms.restoreChannel")}
                      data-tooltip={t("rooms.restoreChannel")}
                      onClick={() => setConfirmPopup({ kind: "restore-channel", room })}
                    >
                      <i className="bi bi-arrow-counterclockwise" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      className="secondary icon-btn tiny delete-action-btn"
                      aria-label={t("rooms.deleteChannelPermanent")}
                      data-tooltip={t("rooms.deleteChannelPermanent")}
                      onClick={() => setConfirmPopup({ kind: "delete-channel-permanent", room })}
                    >
                      <i className="bi bi-trash3-fill" aria-hidden="true" />
                    </Button>
                  </div>
                </li>
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
