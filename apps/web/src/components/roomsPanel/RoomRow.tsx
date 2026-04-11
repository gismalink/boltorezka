import { memo, type FormEvent, useEffect, useRef, useState } from "react";
import type { ChannelAudioQualitySetting, Room, RoomKind, RoomMemberPreference } from "../../domain";
import type { RoomsPanelProps } from "../types";
import type { RoomMember } from "./roomMembers";
import { RoomChannelSettingsPopup } from "./RoomChannelSettingsPopup";
import { RoomMembersList } from "./RoomMembersList";
import { useMemberDragDrop } from "./useMemberDragDrop";
import { useRoomMutePresetState } from "./useRoomMutePresetState";
import { useRoomSettingsAutosave } from "./useRoomSettingsAutosave";
import { useDmOptional } from "../dm/DmContext";

const ROOM_KIND_ICON_CLASS: Record<RoomKind, string> = {
  text: "bi-hash",
  text_voice: "bi-broadcast",
  text_voice_video: "bi-camera-video"
};

type RoomRowProps = Pick<
  RoomsPanelProps,
  | "t"
  | "canCreateRooms"
  | "canKickMembers"
  | "canManageAudioQuality"
  | "roomsTree"
  | "roomSlug"
  | "activeChatRoomSlug"
  | "screenShareOwnerByRoomSlug"
  | "voiceMicStateByUserIdInCurrentRoom"
  | "voiceCameraEnabledByUserIdInCurrentRoom"
  | "voiceAudioOutputMutedByUserIdInCurrentRoom"
  | "audioMuted"
  | "voiceRtcStateByUserIdInCurrentRoom"
  | "voiceMediaStatusSummaryByUserIdInCurrentRoom"
  | "channelSettingsPopupOpenId"
  | "editingRoomTitle"
  | "editingRoomKind"
  | "editingRoomCategoryId"
  | "editingRoomNsfw"
  | "editingRoomHidden"
  | "editingRoomAudioQualitySetting"
  | "onSetEditingRoomTitle"
  | "onSetEditingRoomKind"
  | "onSetEditingRoomCategoryId"
  | "onSetEditingRoomNsfw"
  | "onSetEditingRoomHidden"
  | "onSetEditingRoomAudioQualitySetting"
  | "onSaveChannelSettings"
  | "onMoveChannel"
  | "onOpenChannelSettingsPopup"
  | "onJoinRoom"
  | "onOpenRoomChat"
  | "onKickRoomMember"
  | "onMoveRoomMember"
  | "onSaveMemberPreference"
  | "onLoadServerMemberProfile"
  | "onLoadServerRoles"
  | "onSetServerMemberCustomRoles"
  | "onSetServerMemberHiddenRoomAccess"
  | "onSetRoomNotificationMutePreset"
  | "memberPreferencesByUserId"
> & {
  room: Room;
  roomUnreadCount: number;
  roomMentionUnreadCount: number;
  isRoomUnreadMuted: boolean;
  roomMutePresetValue: "1h" | "8h" | "24h" | "forever" | "off" | null;
  onRoomMutePresetChange: (roomId: string, preset: "1h" | "8h" | "24h" | "forever" | "off") => void;
  roomMembers: RoomMember[];
  normalizedCurrentUserId: string;
  onRequestClearChannel: (room: Room) => void;
  onRequestArchiveChannel: (room: Room) => void;
};

function RoomRowInner({
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
  room,
  roomUnreadCount,
  roomMentionUnreadCount,
  isRoomUnreadMuted,
  roomMutePresetValue,
  onRoomMutePresetChange,
  roomMembers,
  normalizedCurrentUserId,
  onRequestClearChannel,
  onRequestArchiveChannel
}: RoomRowProps) {
  const channelSettingsAnchorRef = useRef<HTMLDivElement>(null);
  const [isEditingChannelTitle, setIsEditingChannelTitle] = useState(false);
  const [editingChannelTitleInitialValue, setEditingChannelTitleInitialValue] = useState("");
  const { dropTargetActive, startDragMember, onRoomDragOver, onRoomDrop, onRoomDragLeave } = useMemberDragDrop({
    room,
    canKickMembers,
    onLoadServerMemberProfile,
    onSetServerMemberHiddenRoomAccess,
    onMoveRoomMember
  });
  const roomSupportsRtc = room.kind !== "text";
  const roomSupportsVideo = room.kind === "text_voice_video";
  const roomHasChatAction = roomSupportsRtc;
  const roomHasSettingsAction = canCreateRooms;
  const roomHasChatOnlyAction = roomHasChatAction && !roomHasSettingsAction;
  const roomActionButtonsCount = (roomHasChatAction ? 1 : 0) + (roomHasSettingsAction ? 1 : 0);
  const roomActionsVariant = roomActionButtonsCount > 1 ? "two" : roomActionButtonsCount === 1 ? "one" : "none";
  const roomScreenShareOwnerId = String(screenShareOwnerByRoomSlug[room.slug]?.userId || "").trim();
  const roomHasVoiceState = roomSupportsRtc && room.slug === roomSlug;
  const dmCtx = useDmOptional();
  const isDmActive = Boolean(dmCtx?.activeThreadId);
  const roomChatActive = activeChatRoomSlug === room.slug;
  const roomIsActive = !isDmActive && (roomSlug === room.slug || (!roomSupportsRtc && roomChatActive));
  const { requestRoomSettingsAutosave } = useRoomSettingsAutosave({
    channelSettingsPopupOpenId,
    roomId: room.id,
    onSaveChannelSettings
  });
  const {
    roomMutePreset,
    roomMuteSaving,
    roomMuteStatusText,
    clearRoomMuteStatusText,
    applyRoomMutePreset
  } = useRoomMutePresetState({
    t,
    roomId: room.id,
    roomMutePresetValue,
    onRoomMutePresetChange,
    onSetRoomNotificationMutePreset
  });

  useEffect(() => {
    if (channelSettingsPopupOpenId !== room.id) {
      setIsEditingChannelTitle(false);
      clearRoomMuteStatusText();
      return;
    }

    setEditingChannelTitleInitialValue(editingRoomTitle);
    setIsEditingChannelTitle(false);
  }, [channelSettingsPopupOpenId, editingRoomTitle, room.id]);

  return (
    <>
    <div
      className={`rooms-row-shell channel-row relative flex flex-col items-stretch ${dropTargetActive ? "channel-row-drop-target" : ""}`}
      onDragOver={onRoomDragOver}
      onDragEnter={onRoomDragOver}
      onDragLeave={onRoomDragLeave}
      onDrop={onRoomDrop}
    >
      <div className={`channel-row-main channel-row-main-actions-${roomActionsVariant} ${roomHasChatOnlyAction ? "channel-row-main-chat-only" : ""} relative flex items-center`}>
      <button
        className={`secondary room-btn room-main-btn room-main-btn-actions-${roomActionsVariant} ${roomIsActive ? "room-btn-active" : "room-btn-interactive"} ${dropTargetActive ? "room-btn-drop-target" : ""}`}
        onClick={() => {
          if (!roomSupportsRtc) {
            onOpenRoomChat(room.slug);
            return;
          }

          if (roomSlug !== room.slug) {
            onJoinRoom(room.slug);
            return;
          }

          onOpenRoomChat(room.slug);
        }}
        onContextMenu={(event) => {
          if (!canCreateRooms) {
            return;
          }
          event.preventDefault();
          onOpenChannelSettingsPopup(room);
        }}
      >
        <i className={`bi ${ROOM_KIND_ICON_CLASS[room.kind]}`} aria-hidden="true" />
        <span>{room.title}</span>
      </button>
      <div className={`channel-right-zone channel-right-zone-actions-${roomActionsVariant} ${roomHasChatOnlyAction ? "channel-right-zone-chat-only" : ""} ${roomChatActive && roomActionButtonsCount > 0 ? "channel-right-zone-chat-active" : ""} ${channelSettingsPopupOpenId === room.id ? "channel-right-zone-open" : ""}`}>
      {roomMentionUnreadCount > 0 ? <span className="room-mention-badge room-row-unread">@</span> : null}
      {roomUnreadCount > 0 ? <span className={`room-unread-badge room-row-unread ${isRoomUnreadMuted ? "room-unread-badge-muted" : ""}`}>{roomUnreadCount}</span> : null}
      <div className={`channel-row-actions channel-row-actions-actions-${roomActionsVariant} inline-flex items-center gap-1 ${roomChatActive && roomActionButtonsCount > 0 ? "channel-row-actions-chat-active" : ""} ${channelSettingsPopupOpenId === room.id ? "channel-row-actions-open" : ""}`}>
      {roomSupportsRtc ? (
        <button
          type="button"
          className={`secondary icon-btn tiny channel-chat-open-btn ${roomChatActive ? "channel-chat-open-btn-active" : ""}`}
          data-tooltip={t("rooms.openChat")}
          aria-label={t("rooms.openChat")}
          onClick={() => {
            onOpenRoomChat(room.slug);
          }}
        >
          <i className="bi bi-chat-dots" aria-hidden="true" />
        </button>
      ) : null}
      {canCreateRooms ? (
        <div className="channel-settings-anchor" ref={channelSettingsAnchorRef}>
          <button
            type="button"
            className="secondary icon-btn tiny channel-action-btn"
            data-tooltip={t("rooms.roomContextMenu")}
            aria-label={t("rooms.roomContextMenu")}
            onClick={() => onOpenChannelSettingsPopup(room)}
          >
            <i className="bi bi-three-dots" aria-hidden="true" />
          </button>
          <RoomChannelSettingsPopup
            t={t}
            room={room}
            open={channelSettingsPopupOpenId === room.id}
            anchorRef={channelSettingsAnchorRef}
            editingRoomTitle={editingRoomTitle}
            editingRoomKind={editingRoomKind}
            editingRoomCategoryId={editingRoomCategoryId}
            editingRoomNsfw={editingRoomNsfw}
            editingRoomHidden={editingRoomHidden}
            editingRoomAudioQualitySetting={editingRoomAudioQualitySetting}
            isEditingChannelTitle={isEditingChannelTitle}
            editingChannelTitleInitialValue={editingChannelTitleInitialValue}
            canManageAudioQuality={canManageAudioQuality}
            roomMutePreset={roomMutePreset}
            roomMuteSaving={roomMuteSaving}
            roomMuteStatusText={roomMuteStatusText}
            roomsTreeCategories={roomsTree?.categories || []}
            onSetEditingRoomTitle={onSetEditingRoomTitle}
            onSetEditingRoomKind={onSetEditingRoomKind}
            onSetEditingRoomCategoryId={onSetEditingRoomCategoryId}
            onSetEditingRoomNsfw={onSetEditingRoomNsfw}
            onSetEditingRoomHidden={onSetEditingRoomHidden}
            onSetEditingRoomAudioQualitySetting={onSetEditingRoomAudioQualitySetting}
            onSaveChannelSettings={onSaveChannelSettings}
            onSetIsEditingChannelTitle={setIsEditingChannelTitle}
            onSetEditingChannelTitleInitialValue={setEditingChannelTitleInitialValue}
            onMoveChannel={onMoveChannel}
            onOpenRoomChat={onOpenRoomChat}
            onRequestClearChannel={onRequestClearChannel}
            onRequestArchiveChannel={onRequestArchiveChannel}
            onApplyRoomMutePreset={applyRoomMutePreset}
            requestRoomSettingsAutosave={requestRoomSettingsAutosave}
          />
        </div>
        ) : null}
      </div>
      </div>
      </div>

      <RoomMembersList
        t={t}
        canKickMembers={canKickMembers}
        voiceMicStateByUserIdInCurrentRoom={voiceMicStateByUserIdInCurrentRoom}
        voiceCameraEnabledByUserIdInCurrentRoom={voiceCameraEnabledByUserIdInCurrentRoom}
        voiceAudioOutputMutedByUserIdInCurrentRoom={voiceAudioOutputMutedByUserIdInCurrentRoom}
        audioMuted={audioMuted}
        voiceRtcStateByUserIdInCurrentRoom={voiceRtcStateByUserIdInCurrentRoom}
        voiceMediaStatusSummaryByUserIdInCurrentRoom={voiceMediaStatusSummaryByUserIdInCurrentRoom}
        onSaveMemberPreference={onSaveMemberPreference}
        onLoadServerMemberProfile={onLoadServerMemberProfile}
        onLoadServerRoles={onLoadServerRoles}
        onKickRoomMember={onKickRoomMember}
        onSetServerMemberCustomRoles={onSetServerMemberCustomRoles}
        onSetServerMemberHiddenRoomAccess={onSetServerMemberHiddenRoomAccess}
        memberPreferencesByUserId={memberPreferencesByUserId}
        room={room}
        roomMembers={roomMembers}
        roomSlug={roomSlug}
        normalizedCurrentUserId={normalizedCurrentUserId}
        roomSupportsRtc={roomSupportsRtc}
        roomSupportsVideo={roomSupportsVideo}
        roomHasVoiceState={roomHasVoiceState}
        roomScreenShareOwnerId={roomScreenShareOwnerId}
        startDragMember={startDragMember}
      />
    </div>
    </>
  );
}

export const RoomRow = memo(RoomRowInner);
