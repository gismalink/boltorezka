import { useRef } from "react";
import type { ChannelAudioQualitySetting, Room, RoomKind } from "../../domain";
import { PopupPortal } from "../PopupPortal";
import type { RoomsPanelProps } from "../types";
import type { RoomMember } from "./roomMembers";

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
  | "voiceMicStateByUserIdInCurrentRoom"
  | "voiceCameraEnabledByUserIdInCurrentRoom"
  | "voiceAudioOutputMutedByUserIdInCurrentRoom"
  | "voiceRtcStateByUserIdInCurrentRoom"
  | "voiceMediaStatusSummaryByUserIdInCurrentRoom"
  | "channelSettingsPopupOpenId"
  | "editingRoomTitle"
  | "editingRoomKind"
  | "editingRoomCategoryId"
  | "editingRoomAudioQualitySetting"
  | "onSetEditingRoomTitle"
  | "onSetEditingRoomKind"
  | "onSetEditingRoomCategoryId"
  | "onSetEditingRoomAudioQualitySetting"
  | "onSaveChannelSettings"
  | "onMoveChannel"
  | "onOpenChannelSettingsPopup"
  | "onJoinRoom"
  | "onKickRoomMember"
> & {
  room: Room;
  roomMembers: RoomMember[];
  normalizedCurrentUserId: string;
  onRequestClearChannel: (room: Room) => void;
  onRequestArchiveChannel: (room: Room) => void;
};

export function RoomRow({
  t,
  canCreateRooms,
  canKickMembers,
  canManageAudioQuality,
  roomsTree,
  roomSlug,
  voiceMicStateByUserIdInCurrentRoom,
  voiceCameraEnabledByUserIdInCurrentRoom,
  voiceAudioOutputMutedByUserIdInCurrentRoom,
  voiceRtcStateByUserIdInCurrentRoom,
  voiceMediaStatusSummaryByUserIdInCurrentRoom,
  channelSettingsPopupOpenId,
  editingRoomTitle,
  editingRoomKind,
  editingRoomCategoryId,
  editingRoomAudioQualitySetting,
  onSetEditingRoomTitle,
  onSetEditingRoomKind,
  onSetEditingRoomCategoryId,
  onSetEditingRoomAudioQualitySetting,
  onSaveChannelSettings,
  onMoveChannel,
  onOpenChannelSettingsPopup,
  onJoinRoom,
  onKickRoomMember,
  room,
  roomMembers,
  normalizedCurrentUserId,
  onRequestClearChannel,
  onRequestArchiveChannel
}: RoomRowProps) {
  const channelSettingsAnchorRef = useRef<HTMLDivElement>(null);
  const roomSupportsRtc = room.kind !== "text";
  const roomSupportsVideo = room.kind === "text_voice_video";
  const roomHasVoiceState = roomSupportsRtc && room.slug === roomSlug;

  return (
    <div className="channel-row relative grid grid-cols-[1fr_auto] items-center gap-2">
      <button
        className={`secondary room-btn ${roomSlug === room.slug ? "room-btn-active" : "room-btn-interactive"}`}
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
        <div className="channel-settings-anchor" ref={channelSettingsAnchorRef}>
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
            anchorRef={channelSettingsAnchorRef}
            className="settings-popup channel-settings-popup"
            placement="bottom-end"
          >
            <div>
              <form className="grid gap-4" onSubmit={onSaveChannelSettings}>
                <h3 className="subheading">{t("rooms.channelSettings")}</h3>
                <input value={editingRoomTitle} onChange={(event) => onSetEditingRoomTitle(event.target.value)} placeholder={t("rooms.channelTitle")} />
                <div className="grid gap-3 desktop:grid-cols-2">
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
                {canManageAudioQuality ? (
                  <div className="grid gap-2">
                    <span>{t("rooms.channelSoundQuality")}</span>
                    <div className="quality-toggle-group" role="radiogroup" aria-label={t("rooms.channelSoundQuality")}>
                      <button
                        type="button"
                        className={`secondary quality-toggle-btn ${editingRoomAudioQualitySetting === "server_default" ? "quality-toggle-btn-active" : ""}`}
                        onClick={() => onSetEditingRoomAudioQualitySetting("server_default")}
                        aria-pressed={editingRoomAudioQualitySetting === "server_default"}
                      >
                        {t("rooms.channelSoundServerDefault")}
                      </button>
                      <button
                        type="button"
                        className={`secondary quality-toggle-btn ${editingRoomAudioQualitySetting === "retro" ? "quality-toggle-btn-active" : ""}`}
                        onClick={() => onSetEditingRoomAudioQualitySetting("retro" as ChannelAudioQualitySetting)}
                        aria-pressed={editingRoomAudioQualitySetting === "retro"}
                      >
                        {t("server.soundRetro")}
                      </button>
                      <button
                        type="button"
                        className={`secondary quality-toggle-btn ${editingRoomAudioQualitySetting === "low" ? "quality-toggle-btn-active" : ""}`}
                        onClick={() => onSetEditingRoomAudioQualitySetting("low" as ChannelAudioQualitySetting)}
                        aria-pressed={editingRoomAudioQualitySetting === "low"}
                      >
                        {t("server.soundLow")}
                      </button>
                      <button
                        type="button"
                        className={`secondary quality-toggle-btn ${editingRoomAudioQualitySetting === "standard" ? "quality-toggle-btn-active" : ""}`}
                        onClick={() => onSetEditingRoomAudioQualitySetting("standard" as ChannelAudioQualitySetting)}
                        aria-pressed={editingRoomAudioQualitySetting === "standard"}
                      >
                        {t("server.soundStandard")}
                      </button>
                      <button
                        type="button"
                        className={`secondary quality-toggle-btn ${editingRoomAudioQualitySetting === "high" ? "quality-toggle-btn-active" : ""}`}
                        onClick={() => onSetEditingRoomAudioQualitySetting("high" as ChannelAudioQualitySetting)}
                        aria-pressed={editingRoomAudioQualitySetting === "high"}
                      >
                        {t("server.soundHigh")}
                      </button>
                    </div>
                  </div>
                ) : null}
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
                  onClick={() => onRequestClearChannel(room)}
                >
                  <i className="bi bi-eraser" aria-hidden="true" /> {t("rooms.clearChat")}
                </button>
                <button
                  type="button"
                  className="secondary delete-action-btn"
                  onClick={() => onRequestArchiveChannel(room)}
                >
                  <i className="bi bi-archive" aria-hidden="true" /> {t("rooms.archiveChannel")}
                </button>
              </form>
            </div>
          </PopupPortal>
        </div>
      ) : null}

      {roomMembers.length > 0 ? (
        <ul className="channel-members-list col-span-full grid gap-0.5 pl-4 pt-0.5">
          {roomMembers.map((member) => {
            const isCurrentUser = Boolean(
              normalizedCurrentUserId && member.userId && member.userId === normalizedCurrentUserId
            );
            const micState = roomHasVoiceState && member.userId
              ? (voiceMicStateByUserIdInCurrentRoom[member.userId] || "silent")
              : "silent";
            const isCameraEnabled = roomHasVoiceState && roomSupportsVideo && member.userId
              ? Boolean(voiceCameraEnabledByUserIdInCurrentRoom[member.userId])
              : false;
            const isVoiceActive = micState === "speaking";
            const isAudioOutputMuted = roomHasVoiceState && member.userId
              ? Boolean(voiceAudioOutputMutedByUserIdInCurrentRoom[member.userId])
              : false;
            const rtcState = roomHasVoiceState && member.userId
              ? (voiceRtcStateByUserIdInCurrentRoom[member.userId] || "disconnected")
              : "disconnected";
            const mediaStatus = roomHasVoiceState && member.userId
              ? (voiceMediaStatusSummaryByUserIdInCurrentRoom[member.userId]
                || (rtcState === "connected" ? "signaling" : rtcState === "connecting" ? "connecting" : "disconnected"))
              : "disconnected";
            const micIconClass = micState === "muted"
              ? "bi-mic-mute"
              : micState === "speaking"
                ? "bi-mic-fill"
                : "bi-mic";
            const mediaStatusIconClass = mediaStatus === "media"
              ? "bi-broadcast-pin"
              : mediaStatus === "signaling"
                ? "bi-arrow-repeat"
                : mediaStatus === "stalled"
                  ? "bi-exclamation-triangle"
                  : mediaStatus === "connecting"
                    ? "bi-hourglass-split"
                    : mediaStatus === "idle"
                      ? "bi-pause-circle"
                      : "bi-plug";
            const mediaStatusClass = mediaStatus === "media"
              ? "channel-member-status-media"
              : mediaStatus === "signaling"
                ? "channel-member-status-signaling"
                : mediaStatus === "stalled"
                  ? "channel-member-status-stalled"
                  : mediaStatus === "connecting"
                    ? "channel-member-status-connecting"
                    : mediaStatus === "idle"
                      ? "channel-member-status-idle"
                      : "channel-member-status-disconnected";
            const connectionTooltip = mediaStatus === "media"
              ? t("rooms.memberStatus.connection.media")
              : mediaStatus === "signaling"
                ? t("rooms.memberStatus.connection.signaling")
                : mediaStatus === "stalled"
                  ? t("rooms.memberStatus.connection.stalled")
                  : mediaStatus === "connecting"
                    ? t("rooms.memberStatus.connection.connecting")
                    : mediaStatus === "idle"
                      ? t("rooms.memberStatus.connection.idle")
                      : t("rooms.memberStatus.connection.disconnected");
            const micTooltip = micState === "muted"
              ? t("rooms.memberStatus.mic.muted")
              : micState === "speaking"
                ? t("rooms.memberStatus.mic.speaking")
                : t("rooms.memberStatus.mic.silent");
            const audioTooltip = isAudioOutputMuted
              ? t("rooms.memberStatus.audio.muted")
              : t("rooms.memberStatus.audio.unmuted");
            const cameraTooltip = isCameraEnabled
              ? t("rooms.memberStatus.camera.on")
              : t("rooms.memberStatus.camera.off");
            const selfMicTooltip = micState === "muted"
              ? t("rooms.memberStatus.self.mic.muted")
              : micState === "speaking"
                ? t("rooms.memberStatus.self.mic.speaking")
                : t("rooms.memberStatus.self.mic.ready");
            const selfAudioTooltip = isAudioOutputMuted
              ? t("rooms.memberStatus.self.audio.muted")
              : t("rooms.memberStatus.self.audio.unmuted");
            const selfCameraTooltip = isCameraEnabled
              ? t("rooms.memberStatus.self.camera.on")
              : t("rooms.memberStatus.self.camera.off");
            const micIconStateClass = micState === "muted" ? "channel-member-mic-icon-muted" : "";

            return (
              <li
                key={`${room.id}-${member.userId || member.userName}`}
                className={`channel-member-item grid min-h-[22px] grid-cols-[auto_1fr_auto_auto] items-center gap-1.5 ${isCurrentUser ? "channel-member-item-current" : ""} ${isVoiceActive ? "channel-member-item-voice-active" : ""}`}
              >
                <span className="channel-member-avatar">{(member.userName || "U").charAt(0).toUpperCase()}</span>
                <span className="channel-member-name">{member.userName}</span>
                <span className="channel-member-icons" aria-hidden="true">
                  {roomHasVoiceState && !isCurrentUser ? (
                    <span className="channel-member-status-icon-anchor" data-tooltip={connectionTooltip}>
                      <i className={`bi ${mediaStatusIconClass} ${mediaStatusClass}`} />
                    </span>
                  ) : null}
                  {roomSupportsRtc ? (
                    <span className="channel-member-status-icon-anchor" data-tooltip={isCurrentUser ? selfMicTooltip : micTooltip}>
                      <i className={`bi ${micIconClass} channel-member-mic-icon ${micIconStateClass}`} />
                    </span>
                  ) : null}
                  {roomSupportsRtc ? (
                    <span className="channel-member-status-icon-anchor" data-tooltip={isCurrentUser ? selfAudioTooltip : audioTooltip}>
                      <i className={`bi bi-headphones channel-member-audio-icon ${isAudioOutputMuted ? "channel-member-audio-icon-muted" : ""}`} />
                    </span>
                  ) : null}
                  {isCameraEnabled ? (
                    <span className="channel-member-status-icon-anchor" data-tooltip={isCurrentUser ? selfCameraTooltip : cameraTooltip}>
                      <i className="bi bi-camera-video-fill channel-member-camera-icon" />
                    </span>
                  ) : null}
                </span>
                {canKickMembers && room.slug && member.userId && !isCurrentUser ? (
                  <button
                    type="button"
                    className="secondary icon-btn tiny channel-member-kick-btn"
                    aria-label={t("rooms.kickFromChannel")}
                    data-tooltip={t("rooms.kickFromChannel")}
                    onClick={() => onKickRoomMember(room.slug, member.userId, member.userName)}
                  >
                    <i className="bi bi-person-x" aria-hidden="true" />
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
