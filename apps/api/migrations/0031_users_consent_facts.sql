-- 0031: Persist user consent facts on the server.
-- cookie_consent_at — момент акцепта cookie-баннера.
-- welcome_intro_completed_at — момент закрытия первой панели приветствия.
-- NULL означает «ещё не дано/не пройдено». Семантика monotonic: один раз
-- проставленное значение последующими PATCH'ами не сбрасывается.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS cookie_consent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS welcome_intro_completed_at TIMESTAMPTZ;
