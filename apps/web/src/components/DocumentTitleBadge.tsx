import { useEffect, useMemo, useRef } from "react";
import { useDm } from "./dm/DmContext";

/**
 * Невизуальный компонент: обновляет `document.title`, добавляя
 * префикс `(N) ` где N — количество непрочитанных (комнаты + личные сообщения).
 *
 * - При монтировании запоминает текущий заголовок как «базовый» (его выставляет main.tsx).
 * - При обновлении подсчёта переопределяет заголовок: `(N) <base>` если N > 0, иначе `<base>`.
 * - При размонтировании восстанавливает базовый заголовок.
 *
 * Источники непрочитанного:
 * - `roomUnreadBySlug` — счётчики, которые уже отображаются в UI комнат
 *   (включают то, что сервер считает «к показу»).
 * - DM-треды из `useDm()` — сумма `unreadCount` по всем тредам.
 */
export function DocumentTitleBadge({
  roomUnreadBySlug
}: {
  roomUnreadBySlug: Record<string, number>;
}) {
  const { threads } = useDm();
  const baseTitleRef = useRef<string | null>(null);

  if (baseTitleRef.current === null && typeof document !== "undefined") {
    // Снимаем базовый заголовок один раз — он уже выставлен в main.tsx.
    const current = document.title || "Datute";
    // Если по какой-то причине прошлый раз не зачистили префикс — снимем его.
    baseTitleRef.current = current.replace(/^\(\d+\)\s+/, "");
  }

  const totalUnread = useMemo(() => {
    let sum = 0;
    for (const value of Object.values(roomUnreadBySlug || {})) {
      const n = Number(value);
      if (Number.isFinite(n) && n > 0) sum += n;
    }
    for (const t of threads || []) {
      const n = Number(t.unreadCount);
      if (Number.isFinite(n) && n > 0) sum += n;
    }
    return sum;
  }, [roomUnreadBySlug, threads]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const base = baseTitleRef.current || "Datute";
    document.title = totalUnread > 0 ? `(${totalUnread}) ${base}` : base;
  }, [totalUnread]);

  useEffect(() => {
    return () => {
      if (typeof document === "undefined") return;
      const base = baseTitleRef.current;
      if (base) document.title = base;
    };
  }, []);

  return null;
}
