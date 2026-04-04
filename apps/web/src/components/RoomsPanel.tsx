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

const OUTSIDE_ROOMS_PRESENCE_KEY = "__outside_rooms__";
const ROOMS_PANEL_GROUPS_STORAGE_KEY = "boltorezka_rooms_panel_groups";
const ROOMS_PANEL_MUTE_PRESETS_STORAGE_KEY = "boltorezka_room_mute_presets";

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
  const [uncategorizedCollapsed, setUncategorizedCollapsed] = useState<boolean>(() => {
    try {
      const parsed = JSON.parse(String(localStorage.getItem(ROOMS_PANEL_GROUPS_STORAGE_KEY) || "{}")) as {
        uncategorizedCollapsed?: boolean;
      };
      return Boolean(parsed.uncategorizedCollapsed);
    } catch {
      return false;
    }
  });
  const [outsideRoomsCollapsed, setOutsideRoomsCollapsed] = useState<boolean>(() => {
    try {
      const parsed = JSON.parse(String(localStorage.getItem(ROOMS_PANEL_GROUPS_STORAGE_KEY) || "{}")) as {
        outsideRoomsCollapsed?: boolean;
      };
      return Boolean(parsed.outsideRoomsCollapsed);
    } catch {
      return false;
    }
  });
  const [archivedCollapsed, setArchivedCollapsed] = useState<boolean>(() => {
    try {
      const parsed = JSON.parse(String(localStorage.getItem(ROOMS_PANEL_GROUPS_STORAGE_KEY) || "{}")) as {
        archivedCollapsed?: boolean;
      };
      return Boolean(parsed.archivedCollapsed);
    } catch {
      return false;
    }
  });
  const [roomMutePresetByRoomId, setRoomMutePresetByRoomId] = useState<Record<string, "1h" | "8h" | "24h" | "forever" | "off">>(() => {
    try {
      const parsed = JSON.parse(String(localStorage.getItem(ROOMS_PANEL_MUTE_PRESETS_STORAGE_KEY) || "{}")) as Record<string, unknown>;
      return Object.entries(parsed).reduce<Record<string, "1h" | "8h" | "24h" | "forever" | "off">>((acc, [roomId, value]) => {
        const normalizedRoomId = String(roomId || "").trim();
        const normalized = String(value || "").trim() as "1h" | "8h" | "24h" | "forever" | "off";
        if (!normalizedRoomId) {
          return acc;
        }
        if (normalized === "1h" || normalized === "8h" || normalized === "24h" || normalized === "forever" || normalized === "off") {
          acc[normalizedRoomId] = normalized;
        }
        return acc;
      }, {});
    } catch {
      return {};
    }
  });

  useEffect(() => {
    localStorage.setItem(ROOMS_PANEL_GROUPS_STORAGE_KEY, JSON.stringify({
      uncategorizedCollapsed,
      outsideRoomsCollapsed,
      archivedCollapsed
    }));
  }, [uncategorizedCollapsed, outsideRoomsCollapsed, archivedCollapsed]);

  useEffect(() => {
    localStorage.setItem(ROOMS_PANEL_MUTE_PRESETS_STORAGE_KEY, JSON.stringify(roomMutePresetByRoomId));
  }, [roomMutePresetByRoomId]);

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
      const categoryRooms = Array.isArray((category as { channels?: Room[] }).channels)
        ? (category as { channels?: Room[] }).channels || []
        : Array.isArray((category as { rooms?: Room[] }).rooms)
          ? (category as { rooms?: Room[] }).rooms || []
          : [];
      categoryRooms.forEach((room) => {
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

    const knownRoomUserIds = new Set<string>();
    const knownRoomUserNames = new Set<string>();
    Object.entries(liveRoomMemberDetailsBySlug || {}).forEach(([slugRaw, members]) => {
      const slug = String(slugRaw || "").trim();
      if (!slug || slug === OUTSIDE_ROOMS_PRESENCE_KEY || !knownRoomSlugs.has(slug)) {
        return;
      }
      (Array.isArray(members) ? members : []).forEach((member) => {
        const userId = String(member.userId || "").trim();
        const userName = String(member.userName || member.userId || "").trim().toLowerCase();
        if (userId) {
          knownRoomUserIds.add(userId);
        }
        if (userName) {
          knownRoomUserNames.add(userName);
        }
      });
    });
    Object.entries(liveRoomMembersBySlug || {}).forEach(([slugRaw, members]) => {
      const slug = String(slugRaw || "").trim();
      if (!slug || slug === OUTSIDE_ROOMS_PRESENCE_KEY || !knownRoomSlugs.has(slug)) {
        return;
      }
      (Array.isArray(members) ? members : []).forEach((memberName) => {
        const normalizedName = String(memberName || "").trim().toLowerCase();
        if (normalizedName) {
          knownRoomUserNames.add(normalizedName);
        }
      });
    });

    const nextById = new Map<string, { userId: string; userName: string }>();
    const knownUserIds = new Set<string>();
    const knownUserNames = new Set<string>();

    const addOutsideMember = (input: { userId?: string | null; userName?: string | null }) => {
      const userId = String(input.userId || "").trim();
      const userName = String(input.userName || input.userId || "").trim();
      if (!userName) {
        return;
      }

      const normalizedUserName = userName.toLowerCase();
      if ((userId && knownRoomUserIds.has(userId)) || knownRoomUserNames.has(normalizedUserName)) {
        return;
      }

      const hasById = userId ? knownUserIds.has(userId) : false;
      const hasByName = knownUserNames.has(normalizedUserName);
      if (hasById || hasByName) {
        if (hasByName && userId) {
          knownUserIds.add(userId);
        }
        return;
      }

      if (userId) {
        knownUserIds.add(userId);
      }
      knownUserNames.add(normalizedUserName);
      nextById.set(userId || normalizedUserName, { userId, userName });
    };

    Object.entries(liveRoomMemberDetailsBySlug || {}).forEach(([slugRaw, members]) => {
      const slug = String(slugRaw || "").trim();
      const isOutsideBucket = slug === OUTSIDE_ROOMS_PRESENCE_KEY || !knownRoomSlugs.has(slug);
      if (!isOutsideBucket) {
        return;
      }

      (Array.isArray(members) ? members : []).forEach((member) => {
        addOutsideMember({
          userId: member.userId,
          userName: member.userName
        });
      });
    });

    Object.entries(liveRoomMembersBySlug || {}).forEach(([slugRaw, memberNames]) => {
      const slug = String(slugRaw || "").trim();
      const isOutsideBucket = slug === OUTSIDE_ROOMS_PRESENCE_KEY || !knownRoomSlugs.has(slug);
      if (!isOutsideBucket) {
        return;
      }

      (Array.isArray(memberNames) ? memberNames : []).forEach((nameRaw) => {
        addOutsideMember({ userName: String(nameRaw || "").trim() });
      });
    });

    return Array.from(nextById.values()).sort((a, b) => a.userName.localeCompare(b.userName));
  }, [roomsTree, uncategorizedRooms, archivedRooms, liveRoomMemberDetailsBySlug, liveRoomMembersBySlug]);

  const knownRoomSlugs = useMemo(() => {
    const next = new Set<string>();
    (roomsTree?.categories || []).forEach((category) => {
      const categoryRooms = Array.isArray((category as { channels?: Room[] }).channels)
        ? (category as { channels?: Room[] }).channels || []
        : Array.isArray((category as { rooms?: Room[] }).rooms)
          ? (category as { rooms?: Room[] }).rooms || []
          : [];
      categoryRooms.forEach((room) => {
        const slug = String(room.slug || "").trim();
        if (slug) {
          next.add(slug);
        }
      });
    });
    uncategorizedRooms.forEach((room) => {
      const slug = String(room.slug || "").trim();
      if (slug) {
        next.add(slug);
      }
    });
    archivedRooms.forEach((room) => {
      const slug = String(room.slug || "").trim();
      if (slug) {
        next.add(slug);
      }
    });
    return next;
  }, [roomsTree, uncategorizedRooms, archivedRooms]);

  const uncategorizedUnreadCount = useMemo(() => {
    return uncategorizedRooms.reduce((sum, room) => {
      const slug = String(room.slug || "").trim();
      if (!slug) {
        return sum;
      }
      return sum + Math.max(0, Number(roomUnreadBySlug[slug] || 0));
    }, 0);
  }, [uncategorizedRooms, roomUnreadBySlug]);

  const outsideRoomsUnreadCount = useMemo(() => {
    return Object.entries(roomUnreadBySlug).reduce((sum, [slugRaw, unreadRaw]) => {
      const slug = String(slugRaw || "").trim();
      if (!slug) {
        return sum;
      }
      if (slug !== OUTSIDE_ROOMS_PRESENCE_KEY && knownRoomSlugs.has(slug)) {
        return sum;
      }
      return sum + Math.max(0, Number(unreadRaw || 0));
    }, 0);
  }, [roomUnreadBySlug, knownRoomSlugs]);

  const categoryUnreadById = useMemo(() => {
    const next: Record<string, number> = {};
    (roomsTree?.categories || []).forEach((category) => {
      const categoryRooms = Array.isArray((category as { channels?: Room[] }).channels)
        ? (category as { channels?: Room[] }).channels || []
        : Array.isArray((category as { rooms?: Room[] }).rooms)
          ? (category as { rooms?: Room[] }).rooms || []
          : [];
      next[category.id] = categoryRooms.reduce((sum, room) => {
        const slug = String(room.slug || "").trim();
        if (!slug) {
          return sum;
        }
        return sum + Math.max(0, Number(roomUnreadBySlug[slug] || 0));
      }, 0);
    });
    return next;
  }, [roomsTree, roomUnreadBySlug]);

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
      isRoomUnreadMuted={(() => {
        const preset = roomMutePresetByRoomId[String(room.id || "").trim()];
        return preset != null && preset !== "off";
      })()}
      roomMutePresetValue={roomMutePresetByRoomId[String(room.id || "").trim()] || null}
      onRoomMutePresetChange={(roomId, preset) => {
        const normalizedRoomId = String(roomId || "").trim();
        if (!normalizedRoomId) {
          return;
        }
        setRoomMutePresetByRoomId((prev) => ({
          ...prev,
          [normalizedRoomId]: preset
        }));
      }}
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
            unreadCount={Math.max(0, Number(categoryUnreadById[category.id] || 0))}
            category={category}
            renderRoomRow={renderRoomRow}
            onRequestDeleteCategory={() => setConfirmPopup({ kind: "delete-category" })}
          />
        ))}

        <RoomsUncategorizedBlock
          t={t}
          rooms={uncategorizedRooms}
          collapsed={uncategorizedCollapsed}
          onToggleCollapsed={() => setUncategorizedCollapsed((prev) => !prev)}
          unreadCount={uncategorizedUnreadCount}
          renderRoomRow={renderRoomRow}
        />

        {onlineOutsideRooms.length > 0 ? (
          <div className="mt-[var(--space-md)]">
            <button
              type="button"
              className="mb-[var(--space-xs)] inline-flex w-full items-center gap-[var(--space-xs)] rounded-[var(--radius-sm)] border-0 bg-transparent px-1.5 py-1 text-left shadow-none hover:bg-[var(--pixel-panel)]/55 hover:translate-x-0 hover:translate-y-0 hover:shadow-none active:translate-x-0 active:translate-y-0 active:shadow-none focus-visible:shadow-none"
              onClick={() => setOutsideRoomsCollapsed((prev) => !prev)}
              aria-expanded={!outsideRoomsCollapsed}
            >
              <i className={`bi ${outsideRoomsCollapsed ? "bi-chevron-right" : "bi-chevron-down"}`} aria-hidden="true" />
              <span className="text-[var(--font-size-sm)] uppercase tracking-[0.04em] text-[var(--pixel-muted)]">{t("rooms.onlineOutsideRooms")}</span>
              {outsideRoomsUnreadCount > 0 ? (
                <span className="room-unread-badge">{outsideRoomsUnreadCount}</span>
              ) : null}
              <span className="rounded-full border border-[var(--pixel-border)] px-2 py-0.5 text-[11px] text-[var(--pixel-muted)]">
                {onlineOutsideRooms.length}
              </span>
            </button>
            {!outsideRoomsCollapsed ? (
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
            ) : null}
          </div>
        ) : null}

        {canCreateRooms && archivedRooms.length > 0 ? (
          <div className="mt-[var(--space-md)]">
            <div className="mb-[var(--space-xs)] flex items-center justify-between gap-2 rounded-[var(--radius-sm)] px-1.5 py-1 hover:bg-[var(--pixel-panel)]/55">
              <button
                type="button"
                className="inline-flex items-center gap-[var(--space-xs)] border-0 bg-transparent p-0 text-[var(--font-size-sm)] uppercase tracking-[0.04em] text-[var(--pixel-muted)] shadow-none hover:translate-x-0 hover:translate-y-0 hover:shadow-none active:translate-x-0 active:translate-y-0 active:shadow-none focus-visible:shadow-none"
                onClick={() => setArchivedCollapsed((prev) => !prev)}
                aria-expanded={!archivedCollapsed}
              >
                <i className={`bi ${archivedCollapsed ? "bi-chevron-right" : "bi-chevron-down"}`} aria-hidden="true" />
                <span>{t("rooms.deletedGroup")}</span>
                <span className="rounded-full border border-[var(--pixel-border)] px-2 py-0.5 text-[11px] text-[var(--pixel-muted)]">
                  {archivedRooms.length}
                </span>
              </button>
              <div>
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
            </div>
            {!archivedCollapsed ? (
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
            ) : null}
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
