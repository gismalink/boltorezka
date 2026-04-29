/**
 * RoomMemberSettingsPopup.tsx — popup-настроек участника в комнате (локальные преференсы).
 * Позволяет настроить индивидуальные громкость, порядок и mute для конкретного участника.
 */
import { PixelCheckbox, PopupPortal, RangeSlider } from "../uicomponents";
import type { TranslateFn } from "../../i18n";
import type { ServerMemberProfileDetails } from "./roomMemberSettingsTypes";
import { useDmOptional } from "../dm/DmContext";

type RoomMemberSettingsPopupProps = {
  t: TranslateFn;
  open: boolean;
  anchorRef: { current: HTMLElement | null };
  memberUserId: string;
  memberUserName: string;
  roomSlug: string;
  volumeValue: number;
  noteValue: string;
  memberMenuProfile: ServerMemberProfileDetails | null;
  setMemberMenuProfile: (profile: ServerMemberProfileDetails | null) => void;
  setMemberProfileModalData: (profile: ServerMemberProfileDetails | null) => void;
  setMemberProfileModalOpen: (value: boolean) => void;
  setMemberPreferenceDraft: (next: { volume: number; note: string }) => void;
  onSaveMemberPreference: (targetUserId: string, input: { volume: number; note: string }) => Promise<void>;
  onLoadServerMemberProfile: (userId: string) => Promise<ServerMemberProfileDetails | null>;
  onSetServerMemberCustomRoles: (userId: string, roleIds: string[]) => Promise<boolean>;
  onSetServerMemberHiddenRoomAccess: (userId: string, roomIds: string[]) => Promise<boolean>;
  onKickRoomMember: (roomSlug: string, userId: string, userName: string) => void;
  canKickMembers: boolean;
  closeMemberMenu: () => void;
  memberRoleSelectorOpen: boolean;
  setMemberRoleSelectorOpen: (value: boolean) => void;
  memberHiddenRoomsSelectorOpen: boolean;
  setMemberHiddenRoomsSelectorOpen: (value: boolean) => void;
  memberRoleAnchorRef: { current: HTMLElement | null };
  memberHiddenRoomsAnchorRef: { current: HTMLElement | null };
  serverRoles: Array<{ id: string; name: string; isBase: boolean }>;
  serverRolesLoading: boolean;
};

export function RoomMemberSettingsPopup({
  t,
  open,
  anchorRef,
  memberUserId,
  memberUserName,
  roomSlug,
  volumeValue,
  noteValue,
  memberMenuProfile,
  setMemberMenuProfile,
  setMemberProfileModalData,
  setMemberProfileModalOpen,
  setMemberPreferenceDraft,
  onSaveMemberPreference,
  onLoadServerMemberProfile,
  onSetServerMemberCustomRoles,
  onSetServerMemberHiddenRoomAccess,
  onKickRoomMember,
  canKickMembers,
  closeMemberMenu,
  memberRoleSelectorOpen,
  setMemberRoleSelectorOpen,
  memberHiddenRoomsSelectorOpen,
  setMemberHiddenRoomsSelectorOpen,
  memberRoleAnchorRef,
  memberHiddenRoomsAnchorRef,
  serverRoles,
  serverRolesLoading
}: RoomMemberSettingsPopupProps) {
  const dm = useDmOptional();
  const selectedCustomRoleIds = memberMenuProfile?.customRoles.map((role) => role.id) || [];
  const selectedCustomRoleNames = memberMenuProfile?.customRoles.map((role) => role.name).filter(Boolean) || [];
  const hiddenRoomsAvailable = memberMenuProfile?.hiddenRoomsAvailable || [];
  const hiddenRoomsGrantedCount = memberMenuProfile?.hiddenRoomAccess.length || 0;

  return (
    <PopupPortal
      open={open}
      anchorRef={anchorRef}
      className="settings-popup channel-member-settings-popup"
      placement="bottom-end"
    >
      <div className="grid gap-3">
        <div className="subheading">{memberUserName}</div>
        <label className="slider-label grid gap-1.5">
          {t("rooms.personalVolume")}: {volumeValue}%
          <RangeSlider
            min={0}
            max={100}
            value={volumeValue}
            valueSuffix="%"
            onChange={(nextValue) => {
              const nextVolume = Math.max(0, Math.min(100, Number(nextValue) || 0));
              setMemberPreferenceDraft({ volume: nextVolume, note: noteValue });
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
                void onSaveMemberPreference(memberUserId, {
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
              setMemberPreferenceDraft({ volume: volumeValue, note: nextNote });
            }}
            placeholder={t("rooms.memberNotePlaceholder")}
          />
        </label>
        <button
          type="button"
          className="secondary flex w-full items-center justify-between gap-3 text-left"
          onClick={async () => {
            const current = memberMenuProfile;
            if (current && current.userId === memberUserId) {
              setMemberProfileModalData(current);
              setMemberProfileModalOpen(true);
              closeMemberMenu();
              return;
            }
            const profile = await onLoadServerMemberProfile(memberUserId);
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
        {dm ? (
          <button
            type="button"
            className="secondary flex w-full items-center justify-between gap-3 text-left"
            onClick={() => {
              dm.openDm(memberUserId, memberUserName);
              closeMemberMenu();
            }}
          >
            <span>{t("rooms.openDm")}</span>
            <i className="bi bi-chat-dots" aria-hidden="true" />
          </button>
        ) : null}
        {canKickMembers ? (
          <>
            <button
              ref={(element) => {
                memberRoleAnchorRef.current = element;
              }}
              type="button"
              className={`secondary flex w-full items-center justify-between gap-4 text-left ${memberRoleSelectorOpen ? "voice-menu-row-active" : ""}`}
              onClick={() => setMemberRoleSelectorOpen(!memberRoleSelectorOpen)}
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
              anchorRef={memberRoleAnchorRef}
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
                          if (!current || current.userId !== memberUserId) {
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
              onClick={() => setMemberHiddenRoomsSelectorOpen(!memberHiddenRoomsSelectorOpen)}
            >
              <span className="min-w-0">
                <span className="voice-menu-title block">{t("server.contextHiddenChats")}</span>
                <span className="voice-menu-subtitle block">{hiddenRoomsGrantedCount}/{hiddenRoomsAvailable.length}</span>
              </span>
              <i className={`bi ${memberHiddenRoomsSelectorOpen ? "bi-chevron-up" : "bi-chevron-down"}`} aria-hidden="true" />
            </button>
            <PopupPortal
              open={memberHiddenRoomsSelectorOpen}
              anchorRef={memberHiddenRoomsAnchorRef}
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
                        if (!current || current.userId !== memberUserId) {
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
              onKickRoomMember(roomSlug, memberUserId, memberUserName);
              closeMemberMenu();
            }}
          >
            <i className="bi bi-person-x" aria-hidden="true" /> {t("rooms.kickFromChannel")}
          </button>
        ) : null}
      </div>
    </PopupPortal>
  );
}
