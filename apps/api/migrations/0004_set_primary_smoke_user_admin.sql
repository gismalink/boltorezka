UPDATE users
SET role = 'admin'
WHERE lower(email) = 'smoke-rtc-1@example.test'
  AND role <> 'super_admin';
