-- Phase 2: Organizations, clients, providers, WHOIS/SSL, sync logs
-- New tables
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT DEFAULT 'free',
  stripe_customer_id TEXT,
  max_seats INTEGER DEFAULT 1,
  max_domains INTEGER,
  max_providers INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_organizations_owner ON organizations(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);

CREATE TABLE IF NOT EXISTS org_memberships (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  invited_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  invited_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_org_memberships_org ON org_memberships(org_id);
CREATE INDEX IF NOT EXISTS idx_org_memberships_user ON org_memberships(user_id);

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  contact_email TEXT,
  contact_name TEXT,
  notes TEXT,
  color TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_clients_org ON clients(org_id);

CREATE TABLE IF NOT EXISTS provider_connections (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider_type TEXT NOT NULL,
  display_name TEXT,
  credentials_encrypted TEXT,
  status TEXT DEFAULT 'active',
  last_sync_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_provider_connections_org ON provider_connections(org_id);
CREATE INDEX IF NOT EXISTS idx_provider_connections_type ON provider_connections(provider_type);

CREATE TABLE IF NOT EXISTS whois_cache (
  id TEXT PRIMARY KEY,
  domain_id TEXT NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  raw_json TEXT,
  registrar TEXT,
  registrant_org TEXT,
  nameservers TEXT,
  expiry_date TIMESTAMPTZ,
  fetched_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_whois_cache_domain ON whois_cache(domain_id);

CREATE TABLE IF NOT EXISTS ssl_checks (
  id TEXT PRIMARY KEY,
  domain_id TEXT NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  issuer TEXT,
  valid_from TIMESTAMPTZ,
  valid_to TIMESTAMPTZ,
  sans TEXT,
  checked_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ssl_checks_domain ON ssl_checks(domain_id);

CREATE TABLE IF NOT EXISTS sync_logs (
  id TEXT PRIMARY KEY,
  provider_connection_id TEXT NOT NULL REFERENCES provider_connections(id) ON DELETE CASCADE,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL,
  summary TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sync_logs_provider ON sync_logs(provider_connection_id);
CREATE INDEX IF NOT EXISTS idx_sync_logs_org ON sync_logs(org_id);

-- Add org_id and related columns to existing tables (nullable for backfill)
ALTER TABLE domains ADD COLUMN IF NOT EXISTS org_id TEXT REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE domains ADD COLUMN IF NOT EXISTS client_id TEXT REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE domains ADD COLUMN IF NOT EXISTS provider_connection_id TEXT REFERENCES provider_connections(id) ON DELETE SET NULL;
ALTER TABLE domains ADD COLUMN IF NOT EXISTS provider_zone_id TEXT;
CREATE INDEX IF NOT EXISTS idx_domains_org_id ON domains(org_id);
CREATE INDEX IF NOT EXISTS idx_domains_client_id ON domains(client_id);

ALTER TABLE dns_records ADD COLUMN IF NOT EXISTS org_id TEXT REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE dns_records ADD COLUMN IF NOT EXISTS provider_record_id TEXT;
ALTER TABLE dns_records ADD COLUMN IF NOT EXISTS proxied INTEGER DEFAULT 0;
ALTER TABLE dns_records ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'local';
CREATE INDEX IF NOT EXISTS idx_dns_records_org_id ON dns_records(org_id);

ALTER TABLE dns_change_history ADD COLUMN IF NOT EXISTS org_id TEXT REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE dns_change_history ADD COLUMN IF NOT EXISTS provider_connection_id TEXT REFERENCES provider_connections(id) ON DELETE SET NULL;
ALTER TABLE dns_change_history ADD COLUMN IF NOT EXISTS sync_status TEXT;
CREATE INDEX IF NOT EXISTS idx_dns_change_history_org_id ON dns_change_history(org_id);

ALTER TABLE scheduled_alerts ADD COLUMN IF NOT EXISTS org_id TEXT REFERENCES organizations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_scheduled_alerts_org_id ON scheduled_alerts(org_id);
