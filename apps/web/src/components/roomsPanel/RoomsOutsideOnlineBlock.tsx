/**
 * RoomsOutsideOnlineBlock.tsx — блок online-участников вне голосовых комнат.
 * Поддерживает контекстные действия (DM, профиль) через useDmOptional.
 */
import { memo } from "react";
import { useDmOptional } from "../dm/DmContext";
type OutsideOnlineMember = {
  userId: string;
  userName: string;
};

type RoomsOutsideOnlineBlockProps = {
  title: string;
  openChatLabel: string;
  collapsed: boolean;
  outsideOnlineCount: number;
  unreadCount: number;
  members: OutsideOnlineMember[];
  currentUserId: string;
  onToggleCollapsed: () => void;
};

function RoomsOutsideOnlineBlockInner({
  title,
  openChatLabel,
  collapsed,
  outsideOnlineCount,
  unreadCount,
  members,
  currentUserId,
  onToggleCollapsed
}: RoomsOutsideOnlineBlockProps) {
  const dm = useDmOptional();
  if (outsideOnlineCount <= 0) {
    return null;
  }

  return (
    <div className="mt-[var(--space-md)]">
      <button
        type="button"
        className="mb-[var(--space-xs)] inline-flex w-full items-center gap-[var(--space-xs)] rounded-[var(--radius-sm)] border-0 bg-transparent px-1.5 py-1 text-left shadow-none hover:bg-[var(--pixel-panel)]/55 hover:translate-x-0 hover:translate-y-0 hover:shadow-none active:translate-x-0 active:translate-y-0 active:shadow-none focus-visible:shadow-none"
        onClick={onToggleCollapsed}
        aria-expanded={!collapsed}
      >
        <i className={`bi ${collapsed ? "bi-chevron-right" : "bi-chevron-down"}`} aria-hidden="true" />
        <span className="rounded-full border border-[var(--pixel-border)] px-2 py-0.5 text-[11px] text-[var(--pixel-muted)]">
          {outsideOnlineCount}
        </span>
        <span className="text-[var(--font-size-sm)] uppercase tracking-[0.04em] text-[var(--pixel-muted)]">{title}</span>
        {unreadCount > 0 ? (
          <span className="room-unread-badge">{unreadCount}</span>
        ) : null}
      </button>
      {!collapsed ? (
        <ul className="rooms-list">
          {members.map((member) => (
            <li key={`outside-online:${member.userId || member.userName}`} className="channel-member-item relative min-h-[22px]">
              <div className="secondary room-btn room-btn-interactive opacity-85">
                <i className="bi bi-circle-fill text-[10px] text-[var(--pixel-accent)]" aria-hidden="true" />
                <span className="rooms-presence-user-name">{member.userName}</span>
              </div>
              {dm && member.userId && member.userId !== currentUserId ? (
                <div className={`channel-member-dm-anchor ${dm.activePeerUserId === member.userId ? "channel-member-dm-anchor-active" : ""}`} style={{ position: "absolute", right: "var(--space-sm)", top: "50%", transform: "translateY(-50%)" }}>
                  {dm.dmUnreadByPeerUserId[member.userId] > 0 ? (
                    <span className="room-unread-badge">{dm.dmUnreadByPeerUserId[member.userId]}</span>
                  ) : null}
                  <button
                    type="button"
                    className={`secondary icon-btn tiny channel-member-dm-btn ${dm.activePeerUserId === member.userId ? "channel-member-dm-btn-active" : ""}`}
                    aria-label={openChatLabel}
                    data-tooltip={openChatLabel}
                    onClick={() => dm.openDm(member.userId, member.userName)}
                  >
                    <i className="bi bi-chat-dots" aria-hidden="true" />
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export const RoomsOutsideOnlineBlock = memo(RoomsOutsideOnlineBlockInner);
