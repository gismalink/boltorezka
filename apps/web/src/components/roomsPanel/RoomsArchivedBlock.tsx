import { Button } from "../uicomponents";
import type { Room } from "../../domain";

type RoomsArchivedBlockProps = {
  canCreateRooms: boolean;
  title: string;
  restoreLabel: string;
  deletePermanentLabel: string;
  deleteAllLabel: string;
  archivedRooms: Room[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onDeleteAll: () => void;
  onRestoreRoom: (room: Room) => void;
  onDeleteRoomPermanent: (room: Room) => void;
};

export function RoomsArchivedBlock({
  canCreateRooms,
  title,
  restoreLabel,
  deletePermanentLabel,
  deleteAllLabel,
  archivedRooms,
  collapsed,
  onToggleCollapsed,
  onDeleteAll,
  onRestoreRoom,
  onDeleteRoomPermanent
}: RoomsArchivedBlockProps) {
  if (!canCreateRooms || archivedRooms.length === 0) {
    return null;
  }

  return (
    <div className="mt-[var(--space-md)]">
      <div className="mb-[var(--space-xs)] flex items-center justify-between gap-2 rounded-[var(--radius-sm)] px-1.5 py-1 hover:bg-[var(--pixel-panel)]/55">
        <button
          type="button"
          className="inline-flex items-center gap-[var(--space-xs)] border-0 bg-transparent p-0 text-[var(--font-size-sm)] uppercase tracking-[0.04em] text-[var(--pixel-muted)] shadow-none hover:translate-x-0 hover:translate-y-0 hover:shadow-none active:translate-x-0 active:translate-y-0 active:shadow-none focus-visible:shadow-none"
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
        >
          <i className={`bi ${collapsed ? "bi-chevron-right" : "bi-chevron-down"}`} aria-hidden="true" />
          <span>{title}</span>
          <span className="rounded-full border border-[var(--pixel-border)] px-2 py-0.5 text-[11px] text-[var(--pixel-muted)]">
            {archivedRooms.length}
          </span>
        </button>
        <div>
          <Button
            type="button"
            className="secondary icon-btn tiny delete-action-btn"
            onClick={onDeleteAll}
            aria-label={deleteAllLabel}
            data-tooltip={deleteAllLabel}
          >
            <i className="bi bi-trash3" aria-hidden="true" />
          </Button>
        </div>
      </div>
      {!collapsed ? (
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
                  aria-label={restoreLabel}
                  data-tooltip={restoreLabel}
                  onClick={() => onRestoreRoom(room)}
                >
                  <i className="bi bi-arrow-counterclockwise" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  className="secondary icon-btn tiny delete-action-btn"
                  aria-label={deletePermanentLabel}
                  data-tooltip={deletePermanentLabel}
                  onClick={() => onDeleteRoomPermanent(room)}
                >
                  <i className="bi bi-trash3-fill" aria-hidden="true" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
