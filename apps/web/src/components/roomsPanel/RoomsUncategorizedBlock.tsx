import type { Room } from "../../domain";
import type { TranslateFn } from "../../i18n";

type RoomsUncategorizedBlockProps = {
  t: TranslateFn;
  rooms: Room[];
  renderRoomRow: (room: Room) => JSX.Element;
};

export function RoomsUncategorizedBlock({ t, rooms, renderRoomRow }: RoomsUncategorizedBlockProps) {
  if (rooms.length === 0) {
    return null;
  }

  return (
    <div className="mt-[var(--space-md)]">
      <div className="mb-[var(--space-xs)] text-[var(--font-size-sm)] uppercase tracking-[0.04em] text-[var(--pixel-muted)]">{t("rooms.uncategorized")}</div>
      <ul className="rooms-list">
        {rooms.map((room) => (
          <li key={room.id}>{renderRoomRow(room)}</li>
        ))}
      </ul>
    </div>
  );
}
