import type { Room } from "../../domain";
import type { TranslateFn } from "../../i18n";

type RoomsUncategorizedBlockProps = {
  t: TranslateFn;
  rooms: Room[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
  renderRoomRow: (room: Room) => JSX.Element;
};

export function RoomsUncategorizedBlock({
  t,
  rooms,
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
        className="mb-[var(--space-xs)] flex w-full items-center justify-between gap-2 rounded-[var(--radius-sm)] px-1.5 py-1 text-left hover:bg-[var(--pixel-panel)]/55"
        onClick={onToggleCollapsed}
        aria-expanded={!collapsed}
      >
        <div className="inline-flex items-center gap-[var(--space-xs)] text-[var(--font-size-sm)] uppercase tracking-[0.04em] text-[var(--pixel-muted)]">
          <i className={`bi ${collapsed ? "bi-chevron-right" : "bi-chevron-down"}`} aria-hidden="true" />
          <span>{t("rooms.uncategorized")}</span>
        </div>
        <span className="rounded-full border border-[var(--pixel-border)] px-2 py-0.5 text-[11px] text-[var(--pixel-muted)]">
          {rooms.length}
        </span>
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
