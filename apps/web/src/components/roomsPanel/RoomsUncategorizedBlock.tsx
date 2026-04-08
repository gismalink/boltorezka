import { memo } from "react";
import type { Room } from "../../domain";
import type { TranslateFn } from "../../i18n";

type RoomsUncategorizedBlockProps = {
  t: TranslateFn;
  rooms: Room[];
  showBadgeCounters: boolean;
  unreadCount: number;
  unreadCountMuted: number;
  unreadCountUnmuted: number;
  mentionCount: number;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  renderRoomRow: (room: Room) => JSX.Element;
};

function RoomsUncategorizedBlockInner({
  t,
  rooms,
  showBadgeCounters,
  unreadCount,
  unreadCountMuted,
  unreadCountUnmuted,
  mentionCount,
  collapsed,
  onToggleCollapsed,
  renderRoomRow
}: RoomsUncategorizedBlockProps) {
  if (rooms.length === 0) {
    return null;
  }

  return (
    <div className="mt-[var(--space-md)]">
      <button
        type="button"
        className="mb-[var(--space-xs)] uncategorized-title-btn relative inline-flex w-full items-center gap-[var(--space-xs)] rounded-[var(--radius-sm)] border-0 bg-transparent py-1 text-left shadow-none hover:bg-[var(--pixel-panel)]/55 hover:translate-x-0 hover:translate-y-0 hover:shadow-none active:translate-x-0 active:translate-y-0 active:shadow-none focus-visible:shadow-none"
        onClick={onToggleCollapsed}
        aria-expanded={!collapsed}
      >
        <i className={`bi ${collapsed ? "bi-chevron-right" : "bi-chevron-down"}`} aria-hidden="true" />
        <span className="rounded-full border border-[var(--pixel-border)] px-2 py-0.5 text-[11px] text-[var(--pixel-muted)]">
          {rooms.length}
        </span>
        <span className="text-[var(--font-size-sm)] uppercase tracking-[0.04em] text-[var(--pixel-muted)]">{t("rooms.uncategorized")}</span>
        {showBadgeCounters && (mentionCount > 0 || unreadCount > 0) ? (
          <span className="group-badge-cluster room-row-unread uncategorized-right-zone">
            {mentionCount > 0 ? <span className="room-mention-badge">@</span> : null}
            {unreadCountMuted > 0 ? <span className="room-unread-badge room-unread-badge-muted">{unreadCountMuted}</span> : null}
            {unreadCountUnmuted > 0 ? <span className="room-unread-badge">{unreadCountUnmuted}</span> : null}
          </span>
        ) : null}
      </button>
      {!collapsed ? (
        <ul className="rooms-list">
          {rooms.map((room) => (
            <li key={room.id}>{renderRoomRow(room)}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export const RoomsUncategorizedBlock = memo(RoomsUncategorizedBlockInner);
