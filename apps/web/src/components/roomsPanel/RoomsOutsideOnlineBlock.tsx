import { memo } from "react";

type OutsideOnlineMember = {
  userId: string;
  userName: string;
};

type RoomsOutsideOnlineBlockProps = {
  title: string;
  collapsed: boolean;
  outsideOnlineCount: number;
  unreadCount: number;
  presenceStale: boolean;
  presenceAgeSec: number;
  members: OutsideOnlineMember[];
  onToggleCollapsed: () => void;
};

function RoomsOutsideOnlineBlockInner({
  title,
  collapsed,
  outsideOnlineCount,
  unreadCount,
  presenceStale,
  presenceAgeSec,
  members,
  onToggleCollapsed
}: RoomsOutsideOnlineBlockProps) {
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
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] ${presenceStale ? "border-amber-500/40 text-amber-500" : "border-emerald-500/40 text-emerald-500"}`}
          aria-label={presenceStale ? `presence stale ${presenceAgeSec}s` : `presence live ${presenceAgeSec}s`}
          title={presenceStale ? `online stale: ${presenceAgeSec}s` : `online live: ${presenceAgeSec}s`}
        >
          <i className={`bi bi-circle-fill text-[8px] ${presenceStale ? "text-amber-500" : "text-emerald-500"}`} aria-hidden="true" />
          <span>{presenceAgeSec}s</span>
        </span>
        {unreadCount > 0 ? (
          <span className="room-unread-badge">{unreadCount}</span>
        ) : null}
      </button>
      {!collapsed ? (
        <ul className="rooms-list">
          {members.map((member) => (
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
  );
}

export const RoomsOutsideOnlineBlock = memo(RoomsOutsideOnlineBlockInner);
