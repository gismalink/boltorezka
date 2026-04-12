import { memo, useMemo } from "react";
import { useDmOptional } from "../dm/DmContext";

type RoomsDirectMessagesBlockProps = {
  title: string;
  emptyLabel: string;
  openChatLabel: string;
  currentUserId: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
};

function RoomsDirectMessagesBlockInner({
  title,
  emptyLabel,
  openChatLabel,
  currentUserId,
  collapsed,
  onToggleCollapsed
}: RoomsDirectMessagesBlockProps) {
  const dm = useDmOptional();
  const normalizedCurrentUserId = String(currentUserId || "").trim();

  const threads = useMemo(() => {
    if (!dm) return [];
    return [...dm.threads]
      .filter((thread) => {
        const peerUserId = String(thread.peerUserId || "").trim();
        return Boolean(peerUserId) && peerUserId !== normalizedCurrentUserId;
      })
      .sort((a, b) => Number(new Date(b.updatedAt || 0)) - Number(new Date(a.updatedAt || 0)));
  }, [dm, normalizedCurrentUserId]);

  if (!dm) {
    return null;
  }

  const unreadTotal = threads.reduce((sum, thread) => sum + Math.max(0, Number(thread.unreadCount || 0)), 0);

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
          {threads.length}
        </span>
        <span className="text-[var(--font-size-sm)] uppercase tracking-[0.04em] text-[var(--pixel-muted)]">{title}</span>
        {unreadTotal > 0 ? (
          <span className="room-unread-badge">{unreadTotal}</span>
        ) : null}
      </button>
      {!collapsed ? (
        threads.length > 0 ? (
          <ul className="rooms-list">
            {threads.map((thread) => {
              const peerUserId = String(thread.peerUserId || "").trim();
              const peerName = String(thread.peerName || thread.peerUserId || "DM").trim() || "DM";
              const isActive = dm.activePeerUserId === peerUserId;
              const unreadCount = Math.max(0, Number(thread.unreadCount || 0));

              return (
                <li key={`dm-thread:${thread.id}`} className="channel-member-item relative min-h-[22px]">
                  <button
                    type="button"
                    className={`secondary room-btn room-btn-interactive opacity-85 ${isActive ? "room-btn-active" : ""}`}
                    onClick={() => dm.openDm(peerUserId, peerName)}
                    aria-label={openChatLabel}
                    data-tooltip={openChatLabel}
                  >
                    <span className="inline-flex min-w-0 items-center gap-2">
                      <i className="bi bi-chat-dots text-[10px] text-[var(--pixel-accent)]" aria-hidden="true" />
                      <span className="truncate rooms-presence-user-name">{peerName}</span>
                    </span>
                    {unreadCount > 0 ? (
                      <span className="room-unread-badge">{unreadCount}</span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="muted px-1.5 py-1 text-[var(--font-size-sm)]">{emptyLabel}</div>
        )
      ) : null}
    </div>
  );
}

export const RoomsDirectMessagesBlock = memo(RoomsDirectMessagesBlockInner);
