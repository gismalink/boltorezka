// Компонент панели комнат: отображает дерево категорий/каналов,
// счетчики непрочитанного и действия администрирования комнаты.
import { useCallback, useEffect, useState } from "react";
import type { Room } from "../domain";
import { RoomsCategoryBlock } from "./roomsPanel/RoomsCategoryBlock";
import { RoomRow } from "./roomsPanel/RoomRow";
import { RoomsConfirmOverlay } from "./roomsPanel/RoomsConfirmOverlay";
import { RoomsPanelHeader } from "./roomsPanel/RoomsPanelHeader";
import { RoomsUncategorizedBlock } from "./roomsPanel/RoomsUncategorizedBlock";
import { RoomsOutsideOnlineBlock } from "./roomsPanel/RoomsOutsideOnlineBlock";
import { RoomsArchivedBlock } from "./roomsPanel/RoomsArchivedBlock";
import { useRoomsPanelDerivedData } from "./roomsPanel/useRoomsPanelDerivedData";
import { useRoomsPanelPersistentState } from "./roomsPanel/useRoomsPanelPersistentState";
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
  roomsTreeLoading,
  roomsTreeBootstrapPending,
  roomSlug,
  activeChatRoomSlug,
  screenShareOwnerByRoomSlug,
  roomUnreadBySlug,
  roomMentionUnreadBySlug,
  serverUnreadCount: _serverUnreadCount,
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
  newCategoryTitle,
  categoryPopupOpen,
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
  const {
    uncategorizedCollapsed,
    setUncategorizedCollapsed,
    outsideRoomsCollapsed,
    setOutsideRoomsCollapsed,
    archivedCollapsed,
    setArchivedCollapsed,
    roomMutePresetByRoomId,
    onRoomMutePresetChange
  } = useRoomsPanelPersistentState();

  const submitConfirmPopup = useCallback(() => {
    if (!confirmPopup) {
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

    switch (confirmPopup.kind) {
      case "delete-category":
        onDeleteCategory();
        break;
      case "clear-channel":
        onClearChannelMessages(confirmPopup.room);
        break;
      case "restore-channel":
        onRestoreChannel(confirmPopup.room);
        break;
      case "delete-channel-permanent":
        onDeleteChannelPermanent(confirmPopup.room);
        break;
      case "archive-channel":
        onDeleteChannel(confirmPopup.room);
        break;
      default:
        break;
    }

    setConfirmPopup(null);
  }, [archivedRooms, confirmPopup, onClearChannelMessages, onDeleteCategory, onDeleteChannel, onDeleteChannelPermanent, onRestoreChannel]);

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
  const getVisibleRoomUnreadCount = useCallback((roomSlugValue: string) => {
    const normalizedSlug = String(roomSlugValue || "").trim();
    if (!normalizedSlug) {
      return 0;
    }

    return Math.max(0, Number(roomUnreadBySlug[normalizedSlug] || 0));
  }, [roomUnreadBySlug]);

  const getVisibleRoomMentionUnreadCount = useCallback((roomSlugValue: string) => {
    const normalizedSlug = String(roomSlugValue || "").trim();
    if (!normalizedSlug) {
      return 0;
    }

    return Math.max(0, Number(roomMentionUnreadBySlug[normalizedSlug] || 0));
  }, [roomMentionUnreadBySlug]);

  const {
    onlineOutsideRooms,
    roomMembersBySlug,
    uncategorizedUnreadCount,
    outsideRoomsUnreadCount,
    categoryUnreadById
  } = useRoomsPanelDerivedData({
    roomsTree,
    uncategorizedRooms,
    archivedRooms,
    roomUnreadBySlug,
    liveRoomMembersBySlug,
    liveRoomMemberDetailsBySlug
  });

  const showInitialRoomsSkeleton = (roomsTreeLoading || roomsTreeBootstrapPending) && !roomsTree;

  const renderRoomsSkeleton = useCallback((rows: number) => (
    <div className="rooms-loading-skeleton" role="status" aria-live="polite" aria-busy="true" aria-label={t("chat.loading")}>
      <div className="rooms-loading-caption">
        <span>{t("chat.loading")}</span>
        <span className="loading-ellipsis" aria-hidden="true" />
      </div>
      {Array.from({ length: rows }).map((_, index) => (
        <div className="rooms-loading-row" key={`rooms-loading-row-${index}`}>
          <span className="rooms-loading-dot" aria-hidden="true" />
          <span className="rooms-loading-line" aria-hidden="true" />
          <span className="rooms-loading-pill" aria-hidden="true" />
        </div>
      ))}
    </div>
  ), [t]);

  const onRequestDeleteCategory = useCallback(() => {
    setConfirmPopup({ kind: "delete-category" });
  }, []);

  const onToggleUncategorizedCollapsed = useCallback(() => {
    setUncategorizedCollapsed((prev) => !prev);
  }, [setUncategorizedCollapsed]);

  const onToggleOutsideRoomsCollapsed = useCallback(() => {
    setOutsideRoomsCollapsed((prev) => !prev);
  }, [setOutsideRoomsCollapsed]);

  const onToggleArchivedCollapsed = useCallback(() => {
    setArchivedCollapsed((prev) => !prev);
  }, [setArchivedCollapsed]);

  const onRequestDeleteAllArchived = useCallback(() => {
    setConfirmPopup({ kind: "delete-all-archived" });
  }, []);

  const onRequestRestoreArchivedRoom = useCallback((room: Room) => {
    setConfirmPopup({ kind: "restore-channel", room });
  }, []);

  const onRequestDeleteArchivedRoomPermanent = useCallback((room: Room) => {
    setConfirmPopup({ kind: "delete-channel-permanent", room });
  }, []);

  const onRequestClearChannel = useCallback((room: Room) => {
    setConfirmPopup({ kind: "clear-channel", room });
  }, []);

  const onRequestArchiveChannel = useCallback((room: Room) => {
    setConfirmPopup({ kind: "archive-channel", room });
  }, []);

  const renderRoomRow = useCallback((room: Room) => (
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
      roomUnreadCount={getVisibleRoomUnreadCount(room.slug)}
      roomMentionUnreadCount={getVisibleRoomMentionUnreadCount(room.slug)}
      isRoomUnreadMuted={(() => {
        const preset = roomMutePresetByRoomId[String(room.id || "").trim()];
        return preset != null && preset !== "off";
      })()}
      roomMutePresetValue={roomMutePresetByRoomId[String(room.id || "").trim()] || null}
      onRoomMutePresetChange={onRoomMutePresetChange}
      roomMembers={roomMembersBySlug[room.slug] || []}
      normalizedCurrentUserId={normalizedCurrentUserId}
      onRequestClearChannel={onRequestClearChannel}
      onRequestArchiveChannel={onRequestArchiveChannel}
    />
  ), [
    t,
    canCreateRooms,
    canKickMembers,
    canManageAudioQuality,
    roomsTree,
    roomSlug,
    activeChatRoomSlug,
    screenShareOwnerByRoomSlug,
    voiceMicStateByUserIdInCurrentRoom,
    voiceCameraEnabledByUserIdInCurrentRoom,
    voiceAudioOutputMutedByUserIdInCurrentRoom,
    audioMuted,
    voiceRtcStateByUserIdInCurrentRoom,
    voiceMediaStatusSummaryByUserIdInCurrentRoom,
    channelSettingsPopupOpenId,
    editingRoomTitle,
    editingRoomKind,
    editingRoomCategoryId,
    editingRoomNsfw,
    editingRoomHidden,
    editingRoomAudioQualitySetting,
    onSetEditingRoomTitle,
    onSetEditingRoomKind,
    onSetEditingRoomCategoryId,
    onSetEditingRoomNsfw,
    onSetEditingRoomHidden,
    onSetEditingRoomAudioQualitySetting,
    onSaveChannelSettings,
    onMoveChannel,
    onOpenChannelSettingsPopup,
    onJoinRoom,
    onOpenRoomChat,
    onKickRoomMember,
    onMoveRoomMember,
    onSaveMemberPreference,
    onLoadServerMemberProfile,
    onLoadServerRoles,
    onSetServerMemberCustomRoles,
    onSetServerMemberHiddenRoomAccess,
    onSetRoomNotificationMutePreset,
    memberPreferencesByUserId,
    getVisibleRoomUnreadCount,
    getVisibleRoomMentionUnreadCount,
    roomMutePresetByRoomId,
    onRoomMutePresetChange,
    roomMembersBySlug,
    normalizedCurrentUserId,
    onRequestClearChannel,
    onRequestArchiveChannel
  ]);

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
      <div className="rooms-scroll min-h-0 flex-1 overflow-y-auto">
        {roomsTreeLoading && roomsTree ? (
          <div className="rooms-refresh-indicator" role="status" aria-live="polite" aria-busy="true" aria-label={t("chat.loading")}>
            <span className="rooms-refresh-indicator-dot" aria-hidden="true" />
            <span>
              {t("chat.loading")}
              <span className="loading-ellipsis" aria-hidden="true" />
            </span>
          </div>
        ) : null}

        {showInitialRoomsSkeleton ? renderRoomsSkeleton(8) : (
          <>
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
            mentionCount={(Array.isArray(category.channels) ? category.channels : []).reduce((sum, room) => {
              const slug = String(room.slug || "").trim();
              if (!slug) {
                return sum;
              }
              return sum + getVisibleRoomMentionUnreadCount(slug);
            }, 0)}
            unreadCountMuted={(Array.isArray(category.channels) ? category.channels : []).reduce((sum, room) => {
              const slug = String(room.slug || "").trim();
              if (!slug) {
                return sum;
              }
              const roomId = String(room.id || "").trim();
              const preset = roomMutePresetByRoomId[roomId];
              const unread = getVisibleRoomUnreadCount(slug);
              if (preset != null && preset !== "off") {
                return sum + unread;
              }
              return sum;
            }, 0)}
            unreadCountUnmuted={(Array.isArray(category.channels) ? category.channels : []).reduce((sum, room) => {
              const slug = String(room.slug || "").trim();
              if (!slug) {
                return sum;
              }
              const roomId = String(room.id || "").trim();
              const preset = roomMutePresetByRoomId[roomId];
              const unread = getVisibleRoomUnreadCount(slug);
              if (preset == null || preset === "off") {
                return sum + unread;
              }
              return sum;
            }, 0)}
            category={category}
            renderRoomRow={renderRoomRow}
            onRequestDeleteCategory={onRequestDeleteCategory}
          />
        ))}

        <RoomsUncategorizedBlock
          t={t}
          rooms={uncategorizedRooms}
          collapsed={uncategorizedCollapsed}
          onToggleCollapsed={onToggleUncategorizedCollapsed}
          unreadCount={uncategorizedRooms.reduce((sum, room) => {
            const slug = String(room.slug || "").trim();
            if (!slug) {
              return sum;
            }
            return sum + getVisibleRoomUnreadCount(slug);
          }, 0)}
          mentionCount={uncategorizedRooms.reduce((sum, room) => {
            const slug = String(room.slug || "").trim();
            if (!slug) {
              return sum;
            }
            return sum + getVisibleRoomMentionUnreadCount(slug);
          }, 0)}
          renderRoomRow={renderRoomRow}
        />

        <RoomsOutsideOnlineBlock
          title={t("rooms.onlineOutsideRooms")}
          collapsed={outsideRoomsCollapsed}
          outsideOnlineCount={onlineOutsideRooms.length}
          unreadCount={outsideRoomsUnreadCount}
          members={onlineOutsideRooms}
          onToggleCollapsed={onToggleOutsideRoomsCollapsed}
        />

        <RoomsArchivedBlock
          canCreateRooms={canCreateRooms}
          title={t("rooms.deletedGroup")}
          restoreLabel={t("rooms.restoreChannel")}
          deletePermanentLabel={t("rooms.deleteChannelPermanent")}
          deleteAllLabel={t("rooms.deleteAllDeleted")}
          archivedRooms={archivedRooms}
          collapsed={archivedCollapsed}
          onToggleCollapsed={onToggleArchivedCollapsed}
          onDeleteAll={onRequestDeleteAllArchived}
          onRestoreRoom={onRequestRestoreArchivedRoom}
          onDeleteRoomPermanent={onRequestDeleteArchivedRoomPermanent}
        />
          </>
        )}
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
