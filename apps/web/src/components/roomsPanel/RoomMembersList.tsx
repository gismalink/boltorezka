import { type DragEvent, useEffect, useRef, useState } from "react";
import type { Room, RoomMemberPreference } from "../../domain";
import type { RoomsPanelProps } from "../types";
import type { RoomMember } from "./roomMembers";
import type { ServerMemberProfileDetails } from "./roomMemberSettingsTypes";
import { RoomMemberSettingsPopup } from "./RoomMemberSettingsPopup";
import { RoomMemberProfileModal } from "./RoomMemberProfileModal";
import { useDmOptional } from "../dm/DmContext";

type RoomMembersListProps = Pick<
  RoomsPanelProps,
  | "t"
  | "canKickMembers"
  | "voiceMicStateByUserIdInCurrentRoom"
  | "voiceCameraEnabledByUserIdInCurrentRoom"
  | "voiceAudioOutputMutedByUserIdInCurrentRoom"
  | "audioMuted"
  | "voiceRtcStateByUserIdInCurrentRoom"
  | "voiceMediaStatusSummaryByUserIdInCurrentRoom"
  | "onSaveMemberPreference"
  | "onLoadServerMemberProfile"
  | "onLoadServerRoles"
  | "onKickRoomMember"
  | "onSetServerMemberCustomRoles"
  | "onSetServerMemberHiddenRoomAccess"
  | "memberPreferencesByUserId"
> & {
  room: Room;
  roomMembers: RoomMember[];
  roomSlug: string;
  normalizedCurrentUserId: string;
  roomSupportsRtc: boolean;
  roomSupportsVideo: boolean;
  roomHasVoiceState: boolean;
  roomScreenShareOwnerId: string;
  startDragMember: (event: DragEvent, userId: string, userName: string) => void;
};

export function RoomMembersList({
  t,
  canKickMembers,
  voiceMicStateByUserIdInCurrentRoom,
  voiceCameraEnabledByUserIdInCurrentRoom,
  voiceAudioOutputMutedByUserIdInCurrentRoom,
  audioMuted,
  voiceRtcStateByUserIdInCurrentRoom,
  voiceMediaStatusSummaryByUserIdInCurrentRoom,
  onSaveMemberPreference,
  onLoadServerMemberProfile,
  onLoadServerRoles,
  onKickRoomMember,
  onSetServerMemberCustomRoles,
  onSetServerMemberHiddenRoomAccess,
  memberPreferencesByUserId,
  room,
  roomMembers,
  roomSlug,
  normalizedCurrentUserId,
  roomSupportsRtc,
  roomSupportsVideo,
  roomHasVoiceState,
  roomScreenShareOwnerId,
  startDragMember
}: RoomMembersListProps) {
  const dm = useDmOptional();
  const memberMenuAnchorRef = useRef<HTMLElement | null>(null);
  const memberRoleAnchorRef = useRef<HTMLElement | null>(null);
  const memberHiddenRoomsAnchorRef = useRef<HTMLElement | null>(null);
  const [memberMenuOpenKey, setMemberMenuOpenKey] = useState<string | null>(null);
  const [memberMenuUserId, setMemberMenuUserId] = useState<string | null>(null);
  const [memberMenuProfile, setMemberMenuProfile] = useState<ServerMemberProfileDetails | null>(null);
  const [memberProfileModalOpen, setMemberProfileModalOpen] = useState(false);
  const [memberProfileModalData, setMemberProfileModalData] = useState<ServerMemberProfileDetails | null>(null);
  const [memberRoleSelectorOpen, setMemberRoleSelectorOpen] = useState(false);
  const [memberHiddenRoomsSelectorOpen, setMemberHiddenRoomsSelectorOpen] = useState(false);
  const [serverRoles, setServerRoles] = useState<Array<{ id: string; name: string; isBase: boolean }>>([]);
  const [serverRolesLoading, setServerRolesLoading] = useState(false);
  const [memberPreferenceDrafts, setMemberPreferenceDrafts] = useState<Record<string, { volume: number; note: string }>>({});

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) {
        return;
      }
      if (
        target.closest(".channel-member-settings-anchor")
        || target.closest(".channel-member-settings-popup")
        || target.closest(".voice-submenu-popup")
      ) {
        return;
      }
      setMemberMenuOpenKey(null);
      memberMenuAnchorRef.current = null;
    };

    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, []);

  useEffect(() => {
    if (!memberMenuUserId) {
      setMemberMenuProfile(null);
      return;
    }

    let disposed = false;
    void onLoadServerMemberProfile(memberMenuUserId).then((profile) => {
      if (!disposed && profile && profile.userId === memberMenuUserId) {
        setMemberMenuProfile(profile);
      }
    });

    return () => {
      disposed = true;
    };
  }, [memberMenuUserId, onLoadServerMemberProfile]);

  useEffect(() => {
    if (!memberMenuUserId || !canKickMembers) {
      return;
    }

    let disposed = false;
    setServerRolesLoading(true);
    void onLoadServerRoles()
      .then((roles) => {
        if (!disposed) {
          setServerRoles(Array.isArray(roles) ? roles : []);
        }
      })
      .finally(() => {
        if (!disposed) {
          setServerRolesLoading(false);
        }
      });

    return () => {
      disposed = true;
    };
  }, [canKickMembers, memberMenuUserId, onLoadServerRoles]);

  const closeMemberMenu = () => {
    setMemberMenuOpenKey(null);
    setMemberMenuUserId(null);
    setMemberRoleSelectorOpen(false);
    setMemberHiddenRoomsSelectorOpen(false);
    memberMenuAnchorRef.current = null;
    memberRoleAnchorRef.current = null;
    memberHiddenRoomsAnchorRef.current = null;
  };

  const openMemberMenu = (
    userId: string,
    menuKey: string,
    anchor: HTMLElement,
    volumeValue: number,
    noteValue: string
  ) => {
    setMemberRoleSelectorOpen(false);
    setMemberHiddenRoomsSelectorOpen(false);
    setMemberPreferenceDrafts((prev) => ({
      ...prev,
      [userId]: {
        volume: volumeValue,
        note: noteValue
      }
    }));
    memberMenuAnchorRef.current = anchor;
    setMemberMenuOpenKey(menuKey);
    setMemberMenuUserId(userId);
  };

  if (roomMembers.length === 0) {
    return null;
  }

  return (
    <>
      <ul className="channel-members-list m-0 list-none grid gap-0.5 pl-[calc(var(--space-xl)*2)] pt-[2px]">
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
          const isAudioOutputMuted = isCurrentUser
            ? Boolean(audioMuted)
            : roomHasVoiceState && member.userId
              ? Boolean(voiceAudioOutputMutedByUserIdInCurrentRoom[member.userId])
              : false;
          const isScreenSharing = Boolean(member.userId) && String(member.userId || "").trim() === roomScreenShareOwnerId;
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
          const memberActionsVariant = canManageMember ? "one" : "none";
          const memberSettingsOpen = memberMenuOpenKey === menuKey && Boolean(member.userId) && memberMenuUserId === member.userId;

          return (
            <li
              key={`${room.id}-${member.userId || member.userName}`}
              className={`room-member-row-shell channel-member-item relative min-h-[22px] ${isCurrentUser ? "channel-member-item-current" : ""} ${isVoiceActive ? "channel-member-item-voice-active" : ""} ${canKickMembers && canManageMember ? "channel-member-item-draggable" : ""}`}
              draggable={Boolean(canKickMembers && canManageMember)}
              onDragStart={(event) => {
                if (!member.userId) {
                  return;
                }
                startDragMember(event, member.userId, member.userName);
              }}
              onContextMenu={(event) => {
                if (!canManageMember || !member.userId) {
                  return;
                }

                event.preventDefault();
                event.stopPropagation();
                openMemberMenu(
                  member.userId,
                  menuKey,
                  (event.currentTarget.querySelector(".channel-member-settings-anchor") as HTMLElement | null)
                    || event.currentTarget,
                  volumeValue,
                  noteValue
                );
              }}
            >
              <div className={`channel-member-main channel-member-main-actions-${memberActionsVariant} grid min-h-[22px] grid-cols-[auto_1fr] items-center gap-1.5`}>
                <span className="channel-member-avatar">{(member.userName || "U").charAt(0).toUpperCase()}</span>
                <span className="channel-member-name">{member.userName}</span>
              </div>
              <div className={`channel-member-right-group channel-member-right-group-actions-${memberActionsVariant} ${memberSettingsOpen ? "channel-member-right-group-open" : ""}`}>
                <span className="channel-member-icons" aria-hidden="true">
                  {roomHasVoiceState && !isCurrentUser ? (
                    <span className="channel-member-status-icon-anchor" data-tooltip={connectionTooltip}>
                      <i className={`bi ${mediaStatusIconClass} ${mediaStatusClass}`} aria-hidden="true" />
                    </span>
                  ) : null}
                  {roomSupportsRtc ? (
                    <span className="channel-member-status-icon-anchor" data-tooltip={isCurrentUser ? selfMicTooltip : micTooltip}>
                      <i className={`bi ${micIconClass} channel-member-mic-icon ${micIconStateClass}`} aria-hidden="true" />
                    </span>
                  ) : null}
                  {roomSupportsRtc ? (
                    <span className="channel-member-status-icon-anchor" data-tooltip={isCurrentUser ? selfAudioTooltip : audioTooltip}>
                      <i className={`bi bi-headphones channel-member-audio-icon ${isAudioOutputMuted ? "channel-member-audio-icon-muted" : ""}`} aria-hidden="true" />
                    </span>
                  ) : null}
                  {isCameraEnabled ? (
                    <span className="channel-member-status-icon-anchor" data-tooltip={isCurrentUser ? selfCameraTooltip : cameraTooltip}>
                      <i className="bi bi-camera-video-fill channel-member-camera-icon" aria-hidden="true" />
                    </span>
                  ) : null}
                  {isScreenSharing ? (
                    <span className="channel-member-status-icon-anchor" data-tooltip={t("rtc.screenShare")}>
                      <i className="bi bi-display channel-member-camera-icon" aria-hidden="true" />
                    </span>
                  ) : null}
                </span>
                {!isCurrentUser && dm && member.userId ? (
                  <div className="channel-member-dm-anchor">
                    {dm.dmUnreadByPeerUserId[member.userId] > 0 ? (
                      <span className="room-unread-badge">{dm.dmUnreadByPeerUserId[member.userId]}</span>
                    ) : null}
                    <button
                      type="button"
                      className="secondary icon-btn tiny channel-member-dm-btn"
                      aria-label={t("rooms.openDm")}
                      data-tooltip={t("rooms.openDm")}
                      onClick={(event) => {
                        event.stopPropagation();
                        dm.openDm(member.userId, member.userName);
                      }}
                    >
                      <i className="bi bi-chat-dots" aria-hidden="true" />
                    </button>
                  </div>
                ) : null}
                {canManageMember ? (
                <div className={`channel-member-settings-anchor channel-member-settings-anchor-actions-${memberActionsVariant} relative ${memberSettingsOpen ? "channel-member-settings-anchor-open" : ""}`}>
                  <button
                    type="button"
                    className="secondary icon-btn tiny channel-member-settings-btn"
                    aria-label={t("rooms.memberSettings")}
                    data-tooltip={t("rooms.memberSettings")}
                    onClick={(event) => {
                      if (!member.userId) {
                        return;
                      }
                      const shouldOpen = memberMenuOpenKey !== menuKey;
                      if (!shouldOpen) {
                        closeMemberMenu();
                        return;
                      }
                      openMemberMenu(
                        member.userId,
                        menuKey,
                        (event.currentTarget.closest(".channel-member-settings-anchor") as HTMLElement | null) || event.currentTarget,
                        volumeValue,
                        noteValue
                      );
                    }}
                  >
                    <i className="bi bi-gear" aria-hidden="true" />
                  </button>
                  {memberSettingsOpen ? (
                    <RoomMemberSettingsPopup
                      t={t}
                      open
                      anchorRef={memberMenuAnchorRef as { current: HTMLElement | null }}
                      memberUserId={member.userId}
                      memberUserName={member.userName}
                      roomSlug={room.slug}
                      volumeValue={volumeValue}
                      noteValue={noteValue}
                      memberMenuProfile={memberMenuProfile}
                      setMemberMenuProfile={setMemberMenuProfile}
                      setMemberProfileModalData={setMemberProfileModalData}
                      setMemberProfileModalOpen={setMemberProfileModalOpen}
                      setMemberPreferenceDraft={(nextDraft) => {
                        setMemberPreferenceDrafts((prev) => ({
                          ...prev,
                          [member.userId]: nextDraft
                        }));
                      }}
                      onSaveMemberPreference={onSaveMemberPreference}
                      onLoadServerMemberProfile={onLoadServerMemberProfile}
                      onSetServerMemberCustomRoles={onSetServerMemberCustomRoles}
                      onSetServerMemberHiddenRoomAccess={onSetServerMemberHiddenRoomAccess}
                      onKickRoomMember={onKickRoomMember}
                      canKickMembers={canKickMembers}
                      closeMemberMenu={closeMemberMenu}
                      memberRoleSelectorOpen={memberRoleSelectorOpen}
                      setMemberRoleSelectorOpen={setMemberRoleSelectorOpen}
                      memberHiddenRoomsSelectorOpen={memberHiddenRoomsSelectorOpen}
                      setMemberHiddenRoomsSelectorOpen={setMemberHiddenRoomsSelectorOpen}
                      memberRoleAnchorRef={memberRoleAnchorRef as { current: HTMLElement | null }}
                      memberHiddenRoomsAnchorRef={memberHiddenRoomsAnchorRef as { current: HTMLElement | null }}
                      serverRoles={serverRoles}
                      serverRolesLoading={serverRolesLoading}
                    />
                  ) : null}
                </div>
              ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      <RoomMemberProfileModal
        t={t}
        open={memberProfileModalOpen}
        data={memberProfileModalData}
        onClose={() => {
          setMemberProfileModalOpen(false);
          setMemberProfileModalData(null);
        }}
      />
    </>
  );
}
