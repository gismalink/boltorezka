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
    <div className="category-block">
      <div className="category-title">{t("rooms.uncategorized")}</div>
      <ul className="rooms-list">
        {rooms.map((room) => (
          <li key={room.id}>{renderRoomRow(room)}</li>
        ))}
      </ul>
    </div>
  );
}
