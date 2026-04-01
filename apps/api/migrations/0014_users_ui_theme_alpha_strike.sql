ALTER TABLE users DROP CONSTRAINT IF EXISTS users_ui_theme_check;

ALTER TABLE users
ADD CONSTRAINT users_ui_theme_check CHECK (ui_theme IN ('8-neon-bit', 'material-classic', 'aka-dis', 'alpha-strike'));
