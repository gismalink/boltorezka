UPDATE users
SET is_bot = TRUE
WHERE lower(email) ~ '^smoke-rtc-[0-9]+@example\.test$';
