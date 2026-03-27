CREATE TABLE IF NOT EXISTS server_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID REFERENCES servers(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  target_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_server_audit_logs_server_id ON server_audit_logs(server_id);
CREATE INDEX IF NOT EXISTS idx_server_audit_logs_actor_user_id ON server_audit_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_server_audit_logs_action ON server_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_server_audit_logs_created_at ON server_audit_logs(created_at DESC);
