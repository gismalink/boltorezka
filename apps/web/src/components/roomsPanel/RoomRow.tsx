import { type DragEvent, useEffect, useRef, useState } from "react";
import type { ChannelAudioQualitySetting, Room, RoomKind, RoomMemberPreference } from "../../domain";
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
  | "onMoveRoomMember"
  | "onSaveMemberPreference"
  | "memberPreferencesByUserId"
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
  onMoveRoomMember,
  onSaveMemberPreference,
  memberPreferencesByUserId,
  room,
  roomMembers,
  normalizedCurrentUserId,
  onRequestClearChannel,
  onRequestArchiveChannel
}: RoomRowProps) {
  const channelSettingsAnchorRef = useRef<HTMLDivElement>(null);
  const memberMenuAnchorRef = useRef<HTMLElement | null>(null);
  const [memberMenuOpenKey, setMemberMenuOpenKey] = useState<string | null>(null);
  const [memberPreferenceDrafts, setMemberPreferenceDrafts] = useState<Record<string, { volume: number; note: string }>>({});
  const [dropTargetActive, setDropTargetActive] = useState(false);
  const roomSupportsRtc = room.kind !== "text";
  const roomSupportsVideo = room.kind === "text_voice_video";
  const roomHasVoiceState = roomSupportsRtc && room.slug === roomSlug;

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) {
        return;
      }
      if (target.closest(".channel-member-settings-anchor") || target.closest(".channel-member-settings-popup")) {
        return;
      }
      setMemberMenuOpenKey(null);
      memberMenuAnchorRef.current = null;
    };

    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const startDragMember = (event: DragEvent, userId: string, userName: string) => {
    event.dataTransfer.setData("application/x-boltorezka-member", JSON.stringify({
      userId,
      userName,
      fromRoomSlug: room.slug
    }));
    event.dataTransfer.setData("application/x-boltorezka-member-from-room", room.slug);
    event.dataTransfer.effectAllowed = "move";
  };

  const resolveDragSourceRoom = (event: DragEvent): string => {
    const directRoomSlug = event.dataTransfer.getData("application/x-boltorezka-member-from-room");
    if (directRoomSlug) {
      return directRoomSlug;
    }
    const payload = event.dataTransfer.getData("application/x-boltorezka-member");
    if (!payload) {
      return "";
    }
    try {
      const parsed = JSON.parse(payload) as { fromRoomSlug?: string };
      return String(parsed.fromRoomSlug || "").trim();
    } catch {
      return "";
    }
  };

  const onRoomDragOver = (event: DragEvent) => {
    if (!canKickMembers) {
      return;
    }

    const hasPayload = Array.from(event.dataTransfer.types).includes("application/x-boltorezka-member");
    if (!hasPayload) {
      return;
    }

    const fromRoomSlug = resolveDragSourceRoom(event);
    if (!fromRoomSlug || fromRoomSlug === room.slug) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropTargetActive(true);
  };

  const onRoomDrop = (event: DragEvent) => {
    event.preventDefault();
    setDropTargetActive(false);

    if (!canKickMembers) {
      return;
    }

    const payload = event.dataTransfer.getData("application/x-boltorezka-member");
    if (!payload) {
      return;
    }

    try {
      const parsed = JSON.parse(payload) as { userId?: string; userName?: string; fromRoomSlug?: string };
      const targetUserId = String(parsed.userId || "").trim();
      const targetUserName = String(parsed.userName || "").trim();
      const fromRoomSlug = String(parsed.fromRoomSlug || "").trim();

      if (!targetUserId || !fromRoomSlug || fromRoomSlug === room.slug) {
        return;
      }

      onMoveRoomMember(fromRoomSlug, room.slug, targetUserId, targetUserName || targetUserId);
    } catch {
      return;
    }
  };

  return (
    <div
      className={`channel-row relative grid grid-cols-[1fr_auto] items-center gap-2 ${dropTargetActive ? "channel-row-drop-target" : ""}`}
      onDragOver={onRoomDragOver}
      onDragEnter={onRoomDragOver}
      onDragLeave={() => setDropTargetActive(false)}
      onDrop={onRoomDrop}
    >
      <button
        className={`secondary room-btn ${roomSlug === room.slug ? "room-btn-active" : "room-btn-interactive"} ${dropTargetActive ? "room-btn-drop-target" : ""}`}
        onClick={() => {
          if (roomSlug !== room.slug) {
            onJoinRoom(room.slug);
          }
        }}
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
        <ul className="col-span-full m-0 list-none grid gap-0.5 pl-[var(--space-xl)] pt-[2px]">
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
            const memberPreference = member.userId
              ? (memberPreferencesByUserId[member.userId] || null)
              : null;
            const memberDraft = member.userId
              ? memberPreferenceDrafts[member.userId]
              : null;
            const volumeValue = Math.max(0, Math.min(100, Number(memberDraft?.volume ?? memberPreference?.volume ?? 100)));
            const noteValue = String(memberDraft?.note ?? memberPreference?.note ?? "");
            const menuKey = `${room.slug}:${member.userId || member.userName}`;
            const canManageMember = Boolean(member.userId) && !isCurrentUser;

            return (
              <li
                key={`${room.id}-${member.userId || member.userName}`}
                className={`channel-member-item grid min-h-[22px] grid-cols-[auto_1fr_auto_auto] items-center gap-1.5 ${isCurrentUser ? "channel-member-item-current" : ""} ${isVoiceActive ? "channel-member-item-voice-active" : ""} ${canKickMembers && canManageMember ? "channel-member-item-draggable" : ""}`}
                draggable={Boolean(canKickMembers && canManageMember)}
                onDragStart={(event) => {
                  if (!member.userId) {
                    return;
                  }
                  startDragMember(event, member.userId, member.userName);
                }}
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
                {canManageMember ? (
                  <div className="channel-member-settings-anchor relative">
                    <button
                      type="button"
                      className="secondary icon-btn tiny channel-member-settings-btn"
                      aria-label={t("rooms.memberSettings")}
                      data-tooltip={t("rooms.memberSettings")}
                      onClick={(event) => {
                        if (!member.userId) {
                          return;
                        }
                        setMemberPreferenceDrafts((prev) => ({
                          ...prev,
                          [member.userId as string]: {
                            volume: volumeValue,
                            note: noteValue
                          }
                        }));
                        const shouldOpen = memberMenuOpenKey !== menuKey;
                        memberMenuAnchorRef.current = shouldOpen
                          ? ((event.currentTarget.closest(".channel-member-settings-anchor") as HTMLElement | null) || event.currentTarget)
                          : null;
                        setMemberMenuOpenKey(shouldOpen ? menuKey : null);
                      }}
                    >
                      <i className="bi bi-gear" aria-hidden="true" />
                    </button>
                    {memberMenuOpenKey === menuKey && member.userId ? (
                      <PopupPortal
                        open
                        anchorRef={memberMenuAnchorRef as { current: HTMLElement | null }}
                        className="settings-popup channel-member-settings-popup"
                        placement="bottom-end"
                      >
                        <div className="grid gap-3">
                          <div className="subheading">{member.userName}</div>
                          <label className="slider-label grid gap-1.5">
                            {t("rooms.personalVolume")}: {volumeValue}%
                            <input
                              type="range"
                              min={0}
                              max={100}
                              value={volumeValue}
                              onChange={(event) => {
                                const nextVolume = Math.max(0, Math.min(100, Number(event.target.value) || 0));
                                setMemberPreferenceDrafts((prev) => ({
                                  ...prev,
                                  [member.userId as string]: {
                                    volume: nextVolume,
                                    note: noteValue
                                  }
                                }));
                              }}
                            />
                          </label>
                          <label className="grid gap-1.5">
                            <span className="row items-center justify-between gap-2">
                              <span className="subheading">{t("rooms.memberNote")}</span>
                              <button
                                type="button"
                                className="secondary icon-btn tiny"
                                aria-label={t("rooms.save")}
                                data-tooltip={t("rooms.save")}
                                onClick={() => {
                                  void onSaveMemberPreference(member.userId as string, {
                                    volume: volumeValue,
                                    note: noteValue
                                  });
                                }}
                              >
                                <i className="bi bi-check2" aria-hidden="true" />
                              </button>
                            </span>
                            <input
                              type="text"
                              maxLength={32}
                              value={noteValue}
                              onChange={(event) => {
                                const nextNote = event.target.value.slice(0, 32);
                                setMemberPreferenceDrafts((prev) => ({
                                  ...prev,
                                  [member.userId as string]: {
                                    volume: volumeValue,
                                    note: nextNote
                                  }
                                }));
                              }}
                              placeholder={t("rooms.memberNotePlaceholder")}
                            />
                          </label>
                          {canKickMembers ? (
                            <button
                              type="button"
                              className="secondary delete-action-btn"
                              onClick={() => {
                                onKickRoomMember(room.slug, member.userId as string, member.userName);
                                setMemberMenuOpenKey(null);
                                  memberMenuAnchorRef.current = null;
                              }}
                            >
                              <i className="bi bi-person-x" aria-hidden="true" /> {t("rooms.kickFromChannel")}
                            </button>
                          ) : null}
                        </div>
                      </PopupPortal>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
