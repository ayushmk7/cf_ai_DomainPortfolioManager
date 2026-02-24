-- Phase 1.2: domain data tables (idempotent)
CREATE TABLE IF NOT EXISTS domains (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  registrar TEXT,
  expiry_date TIMESTAMPTZ,
  ssl_expiry_date TIMESTAMPTZ,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,
  UNIQUE(user_id, domain)
);
CREATE INDEX IF NOT EXISTS idx_domains_user_id ON domains(user_id);
CREATE INDEX IF NOT EXISTS idx_domains_expiry ON domains(expiry_date);

CREATE TABLE IF NOT EXISTS dns_records (
  id TEXT PRIMARY KEY,
  domain_id TEXT NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subdomain TEXT DEFAULT '',
  record_type TEXT NOT NULL,
  value TEXT NOT NULL,
  ttl INTEGER DEFAULT 3600,
  priority INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dns_records_domain_id ON dns_records(domain_id);
CREATE INDEX IF NOT EXISTS idx_dns_records_user_id ON dns_records(user_id);

CREATE TABLE IF NOT EXISTS dns_change_history (
  id TEXT PRIMARY KEY,
  domain_id TEXT NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  record_id TEXT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  record_type TEXT,
  old_value TEXT,
  new_value TEXT,
  changed_at TIMESTAMPTZ NOT NULL,
  change_source TEXT DEFAULT 'user'
);
CREATE INDEX IF NOT EXISTS idx_dns_change_history_domain_time ON dns_change_history(domain_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_dns_change_history_user_id ON dns_change_history(user_id);

CREATE TABLE IF NOT EXISTS scheduled_alerts (
  id TEXT PRIMARY KEY,
  domain_id TEXT NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  sent INTEGER DEFAULT 0,
  message TEXT
);
CREATE INDEX IF NOT EXISTS idx_scheduled_alerts_user_id ON scheduled_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_alerts_scheduled_for ON scheduled_alerts(scheduled_for);
