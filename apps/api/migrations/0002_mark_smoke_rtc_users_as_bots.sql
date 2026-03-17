UPDATE users
SET is_bot = TRUE
WHERE lower(email) ~ '^smoke-rtc-[0-9]+@example\.test$';

UPDATE users
SET access_state = 'active'
WHERE lower(email) ~ '^smoke-rtc-[0-9]+@example\\.test$';
