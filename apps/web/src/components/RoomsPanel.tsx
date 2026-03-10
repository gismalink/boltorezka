import { useEffect, useRef, useState } from "react";
import type { Room } from "../domain";
import { PopupPortal } from "./PopupPortal";
import { RoomsCategoryBlock } from "./roomsPanel/RoomsCategoryBlock";
import { RoomRow } from "./roomsPanel/RoomRow";
import { RoomsConfirmOverlay } from "./roomsPanel/RoomsConfirmOverlay";
import { RoomsPanelHeader } from "./roomsPanel/RoomsPanelHeader";
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
      <RoomsPanelHeader
        t={t}
        canCreateRooms={canCreateRooms}
        roomsTree={roomsTree}
        newCategorySlug={newCategorySlug}
        newCategoryTitle={newCategoryTitle}
        categoryPopupOpen={categoryPopupOpen}
        newRoomSlug={newRoomSlug}
        newRoomTitle={newRoomTitle}
        newRoomKind={newRoomKind}
        newRoomCategoryId={newRoomCategoryId}
        channelPopupOpen={channelPopupOpen}
        categoryPopupRef={categoryPopupRef}
        channelPopupRef={channelPopupRef}
        onSetCategoryPopupOpen={onSetCategoryPopupOpen}
        onSetChannelPopupOpen={onSetChannelPopupOpen}
        onSetNewCategorySlug={onSetNewCategorySlug}
        onSetNewCategoryTitle={onSetNewCategoryTitle}
        onSetNewRoomSlug={onSetNewRoomSlug}
        onSetNewRoomTitle={onSetNewRoomTitle}
        onSetNewRoomKind={onSetNewRoomKind}
        onSetNewRoomCategoryId={onSetNewRoomCategoryId}
        onCreateCategory={onCreateCategory}
        onCreateRoom={onCreateRoom}
      />
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
