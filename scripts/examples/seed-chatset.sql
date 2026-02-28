BEGIN;

WITH input(slug, title, position) AS (
  VALUES
    ('text-channels', 'Текстовые каналы', 0),
    ('status', 'СТАТУС', 1),
    ('rooms', 'КОМНАТЫ', 2),
    ('zapovednik', 'ЗАПОВЕДНИК', 3),
    ('kontrollraeume', 'Kontrollräume', 4)
)
INSERT INTO room_categories (slug, title, position)
SELECT slug, title, position
FROM input
ON CONFLICT (slug) DO UPDATE
SET title = EXCLUDED.title,
    position = EXCLUDED.position;

WITH input(slug, title, kind, category_slug, position) AS (
  VALUES
    ('textovyj-kanal', 'текстовый-канал', 'text', 'text-channels', 0),

    ('nachalnaya-shkola', 'Начальная школа', 'text_voice', 'status', 0),
    ('web-otdel', 'Веб Отдел', 'text_voice', 'status', 1),
    ('robosorevnovaniya', 'Робосоревнования', 'text_voice', 'status', 2),
    ('adminskoe', 'Админское', 'text_voice', 'status', 3),
    ('diana-i-ko', 'Диана и ко', 'text_voice', 'status', 4),
    ('materialovedenie', 'Материаловедение', 'text_voice', 'status', 5),

    ('zal-soveshchaniy', 'Зал совещаний', 'text_voice', 'rooms', 0),
    ('kuhnya', 'Кухня', 'text_voice', 'rooms', 1),
    ('kurilka', 'Курилка', 'text_voice', 'rooms', 2),
    ('akvarium', 'Аквариум', 'text_voice', 'rooms', 3),
    ('picceriya', 'Пиццерия', 'text_voice', 'rooms', 4),
    ('peregovorka-1', 'Переговорка 1', 'text_voice', 'rooms', 5),
    ('peregovorka-2', 'Переговорка 2', 'text_voice', 'rooms', 6),

    ('zaliv-hudozhnikov', 'Залив художников', 'text_voice', 'zapovednik', 0),
    ('za-garazhami', 'За гаражами', 'text_voice', 'zapovednik', 1),
    ('ugolok-analitiki', 'Уголок аналитики', 'text_voice', 'zapovednik', 2),
    ('ugolok-unity', 'Уголок Unity', 'text_voice', 'zapovednik', 3),
    ('ugolok-web', 'Уголок Web', 'text_voice', 'zapovednik', 4),

    ('u-boat', 'u-boat', 'text_voice', 'kontrollraeume', 0)
)
INSERT INTO rooms (slug, title, kind, category_id, position, is_public)
SELECT i.slug, i.title, i.kind, c.id, i.position, TRUE
FROM input i
JOIN room_categories c ON c.slug = i.category_slug
ON CONFLICT (slug) DO UPDATE
SET title = EXCLUDED.title,
    kind = EXCLUDED.kind,
    category_id = EXCLUDED.category_id,
    position = EXCLUDED.position,
    is_public = EXCLUDED.is_public;

COMMIT;
