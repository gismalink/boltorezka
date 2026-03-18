UPDATE users
SET access_state = 'active'
WHERE lower(email) ~ '^smoke-rtc-[0-9]+@example\.test$'
  AND access_state <> 'active';
