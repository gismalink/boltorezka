import { type DragEvent, type FormEvent, useEffect, useRef, useState } from "react";
import type { ChannelAudioQualitySetting, Room, RoomKind, RoomMemberPreference } from "../../domain";
import { PixelCheckbox, PopupPortal, RangeSlider } from "../uicomponents";
import type { RoomsPanelProps } from "../types";
import type { RoomMember } from "./roomMembers";

type ServerMemberProfileDetails = {
  userId: string;
  name: string;
  email: string;
  joinedAt: string;
  role: "owner" | "admin" | "member";
  customRoles: Array<{ id: string; name: string }>;
  hiddenRoomAccess: Array<{ roomId: string; roomSlug: string; roomTitle: string }>;
  hiddenRoomsAvailable: Array<{ roomId: string; roomSlug: string; roomTitle: string; hasAccess: boolean }>;
};

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
  roomMembers,
  normalizedCurrentUserId,
  onRequestClearChannel,
  onRequestArchiveChannel
}: RoomRowProps) {
  const channelSettingsAnchorRef = useRef<HTMLDivElement>(null);
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
  const [isEditingChannelTitle, setIsEditingChannelTitle] = useState(false);
  const [editingChannelTitleInitialValue, setEditingChannelTitleInitialValue] = useState("");
  const [serverRoles, setServerRoles] = useState<Array<{ id: string; name: string; isBase: boolean }>>([]);
  const [serverRolesLoading, setServerRolesLoading] = useState(false);
  const [memberPreferenceDrafts, setMemberPreferenceDrafts] = useState<Record<string, { volume: number; note: string }>>({});
  const [dropTargetActive, setDropTargetActive] = useState(false);
  const [roomMutePreset, setRoomMutePreset] = useState<"1h" | "8h" | "24h" | "forever" | "off" | null>(null);
  const [roomMuteSaving, setRoomMuteSaving] = useState(false);
  const [roomMuteStatusText, setRoomMuteStatusText] = useState("");
  const roomSettingsAutosaveTimerRef = useRef<number | null>(null);
  const roomSupportsRtc = room.kind !== "text";
  const roomSupportsVideo = room.kind === "text_voice_video";
  const roomScreenShareOwnerId = String(screenShareOwnerByRoomSlug[room.slug]?.userId || "").trim();
  const roomHasVoiceState = roomSupportsRtc && room.slug === roomSlug;
  const roomChatActive = activeChatRoomSlug === room.slug;
  const roomIsActive = roomSlug === room.slug || (!roomSupportsRtc && roomChatActive);

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

  useEffect(() => {
    if (channelSettingsPopupOpenId !== room.id) {
      setIsEditingChannelTitle(false);
      setRoomMuteStatusText("");
      return;
    }

    setEditingChannelTitleInitialValue(editingRoomTitle);
    setIsEditingChannelTitle(false);
  }, [channelSettingsPopupOpenId, editingRoomTitle, room.id]);

  useEffect(() => {
    return () => {
      if (roomSettingsAutosaveTimerRef.current) {
        window.clearTimeout(roomSettingsAutosaveTimerRef.current);
      }
    };
  }, []);

  const requestRoomSettingsAutosave = () => {
    if (channelSettingsPopupOpenId !== room.id) {
      return;
    }

    if (roomSettingsAutosaveTimerRef.current) {
      window.clearTimeout(roomSettingsAutosaveTimerRef.current);
    }

    roomSettingsAutosaveTimerRef.current = window.setTimeout(() => {
      const fakeEvent = { preventDefault: () => {} } as FormEvent;
      onSaveChannelSettings(fakeEvent);
      roomSettingsAutosaveTimerRef.current = null;
    }, 120);
  };

  const applyRoomMutePreset = async (preset: "1h" | "8h" | "24h" | "forever" | "off") => {
    if (roomMuteSaving) {
      return;
    }

    setRoomMuteSaving(true);
    setRoomMuteStatusText("");
    try {
      await onSetRoomNotificationMutePreset(room.id, preset);
      setRoomMutePreset(preset);
      setRoomMuteStatusText(t("chat.notificationSaved"));
    } catch {
      setRoomMuteStatusText(t("chat.notificationSaveError"));
    } finally {
      setRoomMuteSaving(false);
    }
  };

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

  const startDragMember = (event: DragEvent, userId: string, userName: string) => {
    const payload = JSON.stringify({
      userId,
      userName,
      fromRoomSlug: room.slug
    });
    event.dataTransfer.setData("application/x-boltorezka-member", payload);
    // Safari may ignore custom MIME types during dragover, keep plain-text fallback.
    event.dataTransfer.setData("text/plain", payload);
    event.dataTransfer.setData("application/x-boltorezka-member-from-room", room.slug);
    event.dataTransfer.effectAllowed = "move";
  };

  const hasMemberDragPayload = (event: DragEvent): boolean => {
    const types = Array.from(event.dataTransfer.types || []);
    return types.includes("application/x-boltorezka-member")
      || types.includes("application/x-boltorezka-member-from-room")
      || types.includes("text/plain");
  };

  const resolveMemberDragPayload = (event: DragEvent): { userId: string; userName: string; fromRoomSlug: string } | null => {
    const payload =
      event.dataTransfer.getData("application/x-boltorezka-member")
      || event.dataTransfer.getData("text/plain");
    if (!payload) {
      return null;
    }

    try {
      const parsed = JSON.parse(payload) as { userId?: string; userName?: string; fromRoomSlug?: string };
      const userId = String(parsed.userId || "").trim();
      const userName = String(parsed.userName || "").trim();
      const fromRoomSlug = String(parsed.fromRoomSlug || "").trim();
      if (!userId || !fromRoomSlug) {
        return null;
      }
      return { userId, userName, fromRoomSlug };
    } catch {
      return null;
    }
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

    if (!hasMemberDragPayload(event)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";

    const fromRoomSlug = resolveDragSourceRoom(event);
    if (fromRoomSlug && fromRoomSlug === room.slug) {
      return;
    }

    setDropTargetActive(true);
  };

  const onRoomDrop = (event: DragEvent) => {
    event.preventDefault();
    setDropTargetActive(false);

    if (!canKickMembers) {
      return;
    }

    const payload = resolveMemberDragPayload(event);
    if (!payload) {
      return;
    }

    const fromRoomSlug = resolveDragSourceRoom(event) || payload.fromRoomSlug;
    if (!payload.userId || !fromRoomSlug || fromRoomSlug === room.slug) {
      return;
    }

    void (async () => {
      if (room.is_hidden) {
        try {
          const profile = await onLoadServerMemberProfile(payload.userId);
          const currentRoomIds = Array.isArray(profile?.hiddenRoomAccess)
            ? profile.hiddenRoomAccess.map((item) => item.roomId)
            : [];
          const nextRoomIds = Array.from(new Set([...currentRoomIds, room.id]));
          const granted = await onSetServerMemberHiddenRoomAccess(payload.userId, nextRoomIds);
          if (!granted) {
            return;
          }
        } catch {
          return;
        }
      }

      onMoveRoomMember(fromRoomSlug, room.slug, payload.userId, payload.userName || payload.userId);
    })();
  };

  return (
    <>
    <div
      className={`channel-row relative grid grid-cols-[1fr_auto] items-center gap-2 ${dropTargetActive ? "channel-row-drop-target" : ""}`}
      onDragOver={onRoomDragOver}
      onDragEnter={onRoomDragOver}
      onDragLeave={() => setDropTargetActive(false)}
      onDrop={onRoomDrop}
    >
      <button
        className={`secondary room-btn ${roomIsActive ? "room-btn-active" : "room-btn-interactive"} ${dropTargetActive ? "room-btn-drop-target" : ""}`}
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
        {roomUnreadCount > 0 ? <span className="room-unread-badge">{roomUnreadCount}</span> : null}
      </button>
      <div className="inline-flex items-center gap-1">
      {roomSupportsRtc ? (
        <button
          type="button"
          className={`secondary icon-btn tiny channel-chat-open-btn ${roomChatActive ? "channel-chat-open-btn-active" : ""}`}
          data-tooltip={t("rooms.openChat")}
          aria-label={t("rooms.openChat")}
          onClick={() => {
            onOpenRoomChat(room.slug);
            if (roomSlug !== room.slug) {
              onJoinRoom(room.slug);
            }
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
          <PopupPortal
            open={channelSettingsPopupOpenId === room.id}
            anchorRef={channelSettingsAnchorRef}
            className="settings-popup channel-settings-popup"
            placement="bottom-end"
          >
            <div>
              <form className="grid gap-4" onSubmit={onSaveChannelSettings}>
                <h3 className="subheading">{t("rooms.channelSettings")}</h3>
                <div className="grid gap-1.5">
                  <span className="subheading">{t("rooms.channelTitle")}</span>
                  <div className="row items-center gap-2 channel-settings-title-row">
                    {isEditingChannelTitle ? (
                      <button
                        type="button"
                        className="secondary whitespace-nowrap"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          onSetEditingRoomTitle(editingChannelTitleInitialValue);
                          setIsEditingChannelTitle(false);
                        }}
                      >
                        {t("settings.cancel")}
                      </button>
                    ) : null}
                    <input
                      className="channel-settings-title-input"
                      value={editingRoomTitle}
                      onFocus={() => {
                        setEditingChannelTitleInitialValue(editingRoomTitle);
                        setIsEditingChannelTitle(true);
                      }}
                      onBlur={() => {
                        onSetEditingRoomTitle(editingChannelTitleInitialValue);
                        setIsEditingChannelTitle(false);
                      }}
                      onChange={(event) => onSetEditingRoomTitle(event.target.value)}
                      placeholder={t("rooms.channelTitle")}
                    />
                    {isEditingChannelTitle ? (
                      <button
                        type="button"
                        className="whitespace-nowrap"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          setEditingChannelTitleInitialValue(editingRoomTitle);
                          setIsEditingChannelTitle(false);
                          requestRoomSettingsAutosave();
                        }}
                      >
                        {t("settings.apply")}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="secondary icon-btn tiny"
                      onClick={() => onMoveChannel("up")}
                      aria-label={t("rooms.up")}
                      data-tooltip={t("rooms.up")}
                    >
                      <i className="bi bi-arrow-up" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="secondary icon-btn tiny"
                      onClick={() => onMoveChannel("down")}
                      aria-label={t("rooms.down")}
                      data-tooltip={t("rooms.down")}
                    >
                      <i className="bi bi-arrow-down" aria-hidden="true" />
                    </button>
                  </div>
                </div>
                <div className="grid gap-3 desktop:grid-cols-2">
                  <select
                    value={editingRoomKind}
                    onChange={(event) => {
                      onSetEditingRoomKind(event.target.value as RoomKind);
                      requestRoomSettingsAutosave();
                    }}
                  >
                    <option value="text">{t("rooms.text")}</option>
                    <option value="text_voice">{t("rooms.textVoice")}</option>
                    <option value="text_voice_video">{t("rooms.textVoiceVideo")}</option>
                  </select>
                  <select
                    value={editingRoomCategoryId}
                    onChange={(event) => {
                      onSetEditingRoomCategoryId(event.target.value);
                      requestRoomSettingsAutosave();
                    }}
                  >
                    <option value="none">{t("rooms.noCategory")}</option>
                    {(roomsTree?.categories || []).map((category) => (
                      <option key={category.id} value={category.id}>{category.title}</option>
                    ))}
                  </select>
                </div>
                <div className="channel-settings-toggles-row">
                  <div className="row items-center justify-between gap-3 channel-settings-toggle-item">
                    <span>{t("rooms.channelNsfw")}</span>
                    <button
                      type="button"
                      className={`ui-switch ${editingRoomNsfw ? "ui-switch-on" : ""}`}
                      role="switch"
                      aria-checked={editingRoomNsfw}
                      aria-label={t("rooms.channelNsfw")}
                      onClick={() => {
                        onSetEditingRoomNsfw(!editingRoomNsfw);
                        requestRoomSettingsAutosave();
                      }}
                    >
                      <span className="ui-switch-thumb" aria-hidden="true" />
                    </button>
                  </div>
                  <div className="row items-center justify-between gap-3 channel-settings-toggle-item">
                    <span>{t("rooms.channelHidden")}</span>
                    <button
                      type="button"
                      className={`ui-switch ${editingRoomHidden ? "ui-switch-on" : ""}`}
                      role="switch"
                      aria-checked={editingRoomHidden}
                      aria-label={t("rooms.channelHidden")}
                      onClick={() => {
                        onSetEditingRoomHidden(!editingRoomHidden);
                        requestRoomSettingsAutosave();
                      }}
                    >
                      <span className="ui-switch-thumb" aria-hidden="true" />
                    </button>
                  </div>
                </div>
                {canManageAudioQuality ? (
                  <div className="grid gap-2">
                    <span>{t("rooms.channelSoundQuality")}</span>
                    <div className="quality-toggle-group" role="radiogroup" aria-label={t("rooms.channelSoundQuality")}>
                      <button
                        type="button"
                        className={`secondary quality-toggle-btn ${editingRoomAudioQualitySetting === "server_default" ? "quality-toggle-btn-active" : ""}`}
                        onClick={() => {
                          onSetEditingRoomAudioQualitySetting("server_default");
                          requestRoomSettingsAutosave();
                        }}
                        aria-pressed={editingRoomAudioQualitySetting === "server_default"}
                      >
                        {t("rooms.channelSoundServerDefault")}
                      </button>
                      <button
                        type="button"
                        className={`secondary quality-toggle-btn ${editingRoomAudioQualitySetting === "retro" ? "quality-toggle-btn-active" : ""}`}
                        onClick={() => {
                          onSetEditingRoomAudioQualitySetting("retro" as ChannelAudioQualitySetting);
                          requestRoomSettingsAutosave();
                        }}
                        aria-pressed={editingRoomAudioQualitySetting === "retro"}
                      >
                        {t("server.soundRetro")}
                      </button>
                      <button
                        type="button"
                        className={`secondary quality-toggle-btn ${editingRoomAudioQualitySetting === "low" ? "quality-toggle-btn-active" : ""}`}
                        onClick={() => {
                          onSetEditingRoomAudioQualitySetting("low" as ChannelAudioQualitySetting);
                          requestRoomSettingsAutosave();
                        }}
                        aria-pressed={editingRoomAudioQualitySetting === "low"}
                      >
                        {t("server.soundLow")}
                      </button>
                      <button
                        type="button"
                        className={`secondary quality-toggle-btn ${editingRoomAudioQualitySetting === "standard" ? "quality-toggle-btn-active" : ""}`}
                        onClick={() => {
                          onSetEditingRoomAudioQualitySetting("standard" as ChannelAudioQualitySetting);
                          requestRoomSettingsAutosave();
                        }}
                        aria-pressed={editingRoomAudioQualitySetting === "standard"}
                      >
                        {t("server.soundStandard")}
                      </button>
                      <button
                        type="button"
                        className={`secondary quality-toggle-btn ${editingRoomAudioQualitySetting === "high" ? "quality-toggle-btn-active" : ""}`}
                        onClick={() => {
                          onSetEditingRoomAudioQualitySetting("high" as ChannelAudioQualitySetting);
                          requestRoomSettingsAutosave();
                        }}
                        aria-pressed={editingRoomAudioQualitySetting === "high"}
                      >
                        {t("server.soundHigh")}
                      </button>
                    </div>
                  </div>
                ) : null}
                <div className="grid gap-2">
                  <span>{t("chat.notificationMute")}</span>
                  <div className="quality-toggle-group chat-topic-context-mute-row" role="group" aria-label={t("chat.notificationMute")}>
                    <button
                      type="button"
                      className={`secondary quality-toggle-btn ${roomMutePreset === "1h" ? "quality-toggle-btn-active" : ""}`}
                      onClick={() => void applyRoomMutePreset("1h")}
                      disabled={roomMuteSaving}
                    >
                      1h
                    </button>
                    <button
                      type="button"
                      className={`secondary quality-toggle-btn ${roomMutePreset === "8h" ? "quality-toggle-btn-active" : ""}`}
                      onClick={() => void applyRoomMutePreset("8h")}
                      disabled={roomMuteSaving}
                    >
                      8h
                    </button>
                    <button
                      type="button"
                      className={`secondary quality-toggle-btn ${roomMutePreset === "24h" ? "quality-toggle-btn-active" : ""}`}
                      onClick={() => void applyRoomMutePreset("24h")}
                      disabled={roomMuteSaving}
                    >
                      24h
                    </button>
                    <button
                      type="button"
                      className={`secondary quality-toggle-btn ${roomMutePreset === "forever" ? "quality-toggle-btn-active" : ""}`}
                      onClick={() => void applyRoomMutePreset("forever")}
                      disabled={roomMuteSaving}
                    >
                      {t("chat.notificationMuteForever")}
                    </button>
                    <button
                      type="button"
                      className={`secondary quality-toggle-btn ${roomMutePreset === "off" ? "quality-toggle-btn-active" : ""}`}
                      onClick={() => void applyRoomMutePreset("off")}
                      disabled={roomMuteSaving}
                    >
                      {t("chat.notificationUnmute")}
                    </button>
                  </div>
                  {roomMuteStatusText ? <div className="chat-topic-read-status" role="status" aria-live="polite">{roomMuteStatusText}</div> : null}
                </div>
                <div className="row items-center gap-2 channel-settings-actions-row">
                  <button
                    type="button"
                    className="secondary clear-action-btn"
                    onClick={() => onOpenRoomChat(room.slug)}
                  >
                    <i className="bi bi-book" aria-hidden="true" /> {t("rooms.markAsRead")}
                  </button>
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
                    <i className="bi bi-archive" aria-hidden="true" /> {t("rooms.deleteChannel")}
                  </button>
                </div>
              </form>
            </div>
          </PopupPortal>
        </div>
      ) : null}
      </div>

      {roomMembers.length > 0 ? (
        <ul className="col-span-full m-0 list-none grid gap-0.5 pl-[calc(var(--space-xl)*2)] pt-[2px]">
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
            const selectedCustomRoleIds = memberMenuProfile?.customRoles.map((role) => role.id) || [];
            const selectedCustomRoleNames = memberMenuProfile?.customRoles.map((role) => role.name).filter(Boolean) || [];
            const hiddenRoomsAvailable = memberMenuProfile?.hiddenRoomsAvailable || [];
            const hiddenRoomsGrantedCount = memberMenuProfile?.hiddenRoomAccess.length || 0;

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
                  {isScreenSharing ? (
                    <span className="channel-member-status-icon-anchor" data-tooltip={t("rtc.screenShare")}>
                      <i className="bi bi-display channel-member-camera-icon" />
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
                    {memberMenuOpenKey === menuKey && member.userId && memberMenuUserId === member.userId ? (
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
                            <RangeSlider
                              min={0}
                              max={100}
                              value={volumeValue}
                              valueSuffix="%"
                              onChange={(nextValue) => {
                                const nextVolume = Math.max(0, Math.min(100, Number(nextValue) || 0));
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
                          <button
                            type="button"
                            className="secondary flex w-full items-center justify-between gap-3 text-left"
                            onClick={async () => {
                              const current = memberMenuProfile;
                              if (current && current.userId === member.userId) {
                                setMemberProfileModalData(current);
                                setMemberProfileModalOpen(true);
                                closeMemberMenu();
                                return;
                              }
                              const profile = await onLoadServerMemberProfile(member.userId as string);
                              if (!profile) {
                                return;
                              }
                              setMemberProfileModalData(profile);
                              setMemberProfileModalOpen(true);
                              closeMemberMenu();
                            }}
                          >
                            <span>{t("server.contextProfile")}</span>
                            <i className="bi bi-person-vcard" aria-hidden="true" />
                          </button>
                          {canKickMembers ? (
                            <>
                              <button
                                ref={(element) => {
                                  memberRoleAnchorRef.current = element;
                                }}
                                type="button"
                                className={`secondary flex w-full items-center justify-between gap-4 text-left ${memberRoleSelectorOpen ? "voice-menu-row-active" : ""}`}
                                onClick={() => setMemberRoleSelectorOpen((current) => !current)}
                              >
                                <span className="min-w-0">
                                  <span className="voice-menu-title block">{t("server.contextServerRoles")}</span>
                                  <span className="voice-menu-subtitle block">
                                    {selectedCustomRoleNames.length > 0
                                      ? selectedCustomRoleNames.join(", ")
                                      : t("server.roleNoCustom")}
                                  </span>
                                </span>
                                <i className={`bi ${memberRoleSelectorOpen ? "bi-chevron-up" : "bi-chevron-down"}`} aria-hidden="true" />
                              </button>
                              <PopupPortal
                                open={memberRoleSelectorOpen}
                                anchorRef={memberRoleAnchorRef as { current: HTMLElement | null }}
                                className="settings-popup voice-submenu-popup"
                                placement="right-start"
                                offset={8}
                              >
                                <div className="grid gap-2">
                                  {serverRolesLoading ? <p className="muted">{t("server.rolesLoading")}</p> : null}
                                  <div className="device-list mt-1 grid gap-1.5">
                                    {serverRoles.filter((role) => !role.isBase).map((role) => {
                                      const checked = selectedCustomRoleIds.includes(role.id);
                                      return (
                                        <PixelCheckbox
                                          key={role.id}
                                          checked={checked}
                                          onChange={async (nextChecked) => {
                                            const current = memberMenuProfile;
                                            if (!current || current.userId !== member.userId) {
                                              return;
                                            }
                                            const currentIds = current.customRoles.map((item) => item.id);
                                            const nextRoleIds = nextChecked
                                              ? Array.from(new Set([...currentIds, role.id]))
                                              : currentIds.filter((item) => item !== role.id);
                                            const ok = await onSetServerMemberCustomRoles(current.userId, nextRoleIds);
                                            if (!ok) {
                                              return;
                                            }
                                            const refreshed = await onLoadServerMemberProfile(current.userId);
                                            if (refreshed) {
                                              setMemberMenuProfile(refreshed);
                                            }
                                          }}
                                          label={role.name}
                                          className={`secondary device-item text-left ${checked ? "device-item-active" : ""}`}
                                        />
                                      );
                                    })}
                                  </div>
                                </div>
                              </PopupPortal>
                            </>
                          ) : null}
                          {canKickMembers && hiddenRoomsAvailable.length > 0 ? (
                            <>
                              <button
                                ref={(element) => {
                                  memberHiddenRoomsAnchorRef.current = element;
                                }}
                                type="button"
                                className={`secondary flex w-full items-center justify-between gap-4 text-left ${memberHiddenRoomsSelectorOpen ? "voice-menu-row-active" : ""}`}
                                onClick={() => setMemberHiddenRoomsSelectorOpen((current) => !current)}
                              >
                                <span className="min-w-0">
                                  <span className="voice-menu-title block">{t("server.contextHiddenChats")}</span>
                                  <span className="voice-menu-subtitle block">{hiddenRoomsGrantedCount}/{hiddenRoomsAvailable.length}</span>
                                </span>
                                <i className={`bi ${memberHiddenRoomsSelectorOpen ? "bi-chevron-up" : "bi-chevron-down"}`} aria-hidden="true" />
                              </button>
                              <PopupPortal
                                open={memberHiddenRoomsSelectorOpen}
                                anchorRef={memberHiddenRoomsAnchorRef as { current: HTMLElement | null }}
                                className="settings-popup voice-submenu-popup"
                                placement="right-start"
                                offset={8}
                              >
                                <div className="device-list mt-1 grid max-h-[260px] gap-1.5 overflow-auto pr-1">
                                  {hiddenRoomsAvailable.map((roomAccess) => {
                                    const checked = Boolean(memberMenuProfile?.hiddenRoomAccess.some((item) => item.roomId === roomAccess.roomId));
                                    return (
                                      <button
                                        key={roomAccess.roomId}
                                        type="button"
                                        className={`secondary device-item radio-item flex items-center justify-between gap-4 text-left ${checked ? "device-item-active" : ""}`}
                                        onClick={async () => {
                                          const current = memberMenuProfile;
                                          if (!current || current.userId !== member.userId) {
                                            return;
                                          }
                                          const nextRoomIds = checked
                                            ? current.hiddenRoomAccess.filter((item) => item.roomId !== roomAccess.roomId).map((item) => item.roomId)
                                            : [...current.hiddenRoomAccess.map((item) => item.roomId), roomAccess.roomId];
                                          const ok = await onSetServerMemberHiddenRoomAccess(current.userId, nextRoomIds);
                                          if (!ok) {
                                            return;
                                          }
                                          const refreshed = await onLoadServerMemberProfile(current.userId);
                                          if (refreshed) {
                                            setMemberMenuProfile(refreshed);
                                          }
                                        }}
                                      >
                                        <span>{roomAccess.roomTitle}</span>
                                        <i className={`bi ${checked ? "bi-record-circle-fill" : "bi-circle"}`} aria-hidden="true" />
                                      </button>
                                    );
                                  })}
                                </div>
                              </PopupPortal>
                            </>
                          ) : null}
                          {canKickMembers ? (
                            <button
                              type="button"
                              className="secondary delete-action-btn"
                              onClick={() => {
                                onKickRoomMember(room.slug, member.userId as string, member.userName);
                                closeMemberMenu();
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
    {memberProfileModalOpen && memberProfileModalData ? (
      <div className="fixed inset-0 z-[185] flex items-center justify-center bg-black/65 px-4" role="dialog" aria-modal="true">
        <div className="card compact grid w-full max-w-[460px] gap-3 p-4">
          <h3>{t("rooms.memberProfileTitle")}</h3>
          <div><strong>{t("server.profileName")}: </strong>{memberProfileModalData.name}</div>
          <div><strong>Email: </strong>{memberProfileModalData.email}</div>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setMemberProfileModalOpen(false);
              setMemberProfileModalData(null);
            }}
          >
            {t("settings.closeVoiceAria")}
          </button>
        </div>
      </div>
    ) : null}
    </>
  );
}
