/**
 * Postgres layer for user accounts and domain data.
 * Uses @neondatabase/serverless (works on Cloudflare Workers).
 * Supports DATABASE_URL (Neon) and HYPERDRIVE bindings.
 */

import { neon } from "@neondatabase/serverless";
import type { Env } from "../types";

export interface PgUser {
  id: string;
  firebase_uid: string;
  email: string;
  display_name: string | null;
  created_at: string;
}

function getConnectionString(env: Env): string | null {
  if (env.HYPERDRIVE) {
    return (env.HYPERDRIVE as { connectionString: string }).connectionString;
  }
  return env.DATABASE_URL ?? null;
}

export function isPostgresConfigured(env: Env): boolean {
  return getConnectionString(env) !== null;
}

/**
 * Run a parameterized query. Supports $1, $2, ... placeholders.
 * Uses Neon serverless driver (tagged template under the hood).
 */
export async function pgQuery(
  env: Env,
  sql: string,
  params: unknown[] = [],
): Promise<Record<string, unknown>[]> {
  const connStr = getConnectionString(env);
  if (!connStr) throw new Error("Postgres not configured");

  const sqlFn = neon(connStr);

  // Convert $1, $2, ... placeholders to Neon tagged template form.
  // Split by $N and build (stringParts, ...values).
  const parts = sql.split(/\$(\d+)/g);
  const stringParts: string[] = [];
  const values: unknown[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      stringParts.push(parts[i]);
    } else {
      const paramIndex = parseInt(parts[i], 10) - 1;
      values.push(params[paramIndex]);
    }
  }

  // Tagged template invocation: sql(stringParts, ...values)
  const result = await (sqlFn as (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, unknown>[]>)(
    stringParts as unknown as TemplateStringsArray,
    ...values,
  );
  return Array.isArray(result) ? result : [result];
}

export async function runMigrations(env: Env): Promise<void> {
  if (!isPostgresConfigured(env)) return;
  await runMigrationRunner(env);
}

const MIGRATION_SQL_LEGACY = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  firebase_uid TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
`;

/**
 * Run versioned migrations and track in schema_migrations.
 * SQL content matches backend/migrations/001_users.sql and 002_domain_data.sql
 * (inline here because Workers cannot read files at runtime).
 */
export async function runMigrationRunner(env: Env): Promise<void> {
  if (!isPostgresConfigured(env)) return;

  await pgQuery(
    env,
    `CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT NOW())`,
  );

  const migrations = [
    { name: "001_users", sql: getMigration001Users() },
    { name: "002_domain_data", sql: getMigration002DomainData() },
    { name: "003_phase2_orgs_providers", sql: getMigration003Phase2() },
    { name: "004_org_invitations", sql: getMigration004OrgInvitations() },
    { name: "005_notifications", sql: getMigration005Notifications() },
  ];

  for (const m of migrations) {
    const rows = await pgQuery(env, `SELECT 1 FROM schema_migrations WHERE name = $1`, [m.name]);
    if (rows.length > 0) continue;

    const statements = m.sql
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith("--"));
    for (const stmt of statements) {
      await pgQuery(env, stmt + ";");
    }
    await pgQuery(env, `INSERT INTO schema_migrations (name) VALUES ($1)`, [m.name]);
  }

  // Legacy: ensure users table exists (in case we ran old runMigrations before)
  for (const stmt of MIGRATION_SQL_LEGACY.split(";").filter((s) => s.trim())) {
    await pgQuery(env, stmt + ";");
  }
}

function getMigration001Users(): string {
  return `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  firebase_uid TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
`;
}

function getMigration002DomainData(): string {
  return `
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
`;
}

function getMigration003Phase2(): string {
  return `
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
`;
}

function getMigration004OrgInvitations(): string {
  return `
CREATE TABLE IF NOT EXISTS org_invitations (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member', 'viewer')),
  token TEXT UNIQUE NOT NULL,
  invited_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_org_invitations_org ON org_invitations(org_id);
CREATE INDEX IF NOT EXISTS idx_org_invitations_token ON org_invitations(token);
`;
}

function getMigration005Notifications(): string {
  return `
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  payload TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read_at);
`;
}

export interface PgOrganization {
  id: string;
  name: string;
  slug: string;
  owner_user_id: string;
  plan: string;
  max_seats: number;
  created_at: string;
}

/** Ensure user has a personal org (create if not exists). Creates org and membership, backfills org_id on domains/dns_records/etc. */
export async function ensurePersonalOrg(
  env: Env,
  userId: string,
  email?: string,
): Promise<PgOrganization | null> {
  if (!isPostgresConfigured(env)) return null;
  const existing = await pgQuery(
    env,
    `SELECT o.* FROM organizations o
     JOIN org_memberships m ON m.org_id = o.id AND m.user_id = $1 AND m.role = 'owner'
     LIMIT 1`,
    [userId],
  );
  if (existing.length > 0) {
    const org = existing[0] as unknown as PgOrganization;
    await backfillOrgIdForUser(env, userId, org.id);
    return org;
  }
  const orgId = crypto.randomUUID();
  const membershipId = crypto.randomUUID();
  const name = "Personal";
  const slug = `personal-${userId.slice(0, 8)}-${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();
  await pgQuery(
    env,
    `INSERT INTO organizations (id, name, slug, owner_user_id, plan, max_seats, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'free', 1, $5, $5)`,
    [orgId, name, slug, userId, now],
  );
  await pgQuery(
    env,
    `INSERT INTO org_memberships (id, org_id, user_id, role, accepted_at, created_at)
     VALUES ($1, $2, $3, 'owner', $4, $4)`,
    [membershipId, orgId, userId, now],
  );
  await backfillOrgIdForUser(env, userId, orgId);
  const rows = await pgQuery(env, `SELECT * FROM organizations WHERE id = $1 LIMIT 1`, [orgId]);
  return (rows[0] as unknown as PgOrganization) ?? null;
}

async function backfillOrgIdForUser(env: Env, userId: string, orgId: string): Promise<void> {
  await pgQuery(env, `UPDATE domains SET org_id = $1 WHERE user_id = $2 AND org_id IS NULL`, [orgId, userId]);
  await pgQuery(env, `UPDATE dns_records SET org_id = $1 WHERE user_id = $2 AND org_id IS NULL`, [orgId, userId]);
  await pgQuery(env, `UPDATE dns_change_history SET org_id = $1 WHERE user_id = $2 AND org_id IS NULL`, [orgId, userId]);
  await pgQuery(env, `UPDATE scheduled_alerts SET org_id = $1 WHERE user_id = $2 AND org_id IS NULL`, [orgId, userId]);
}

export async function upsertUser(
  env: Env,
  firebaseUid: string,
  email: string,
  displayName: string | null,
): Promise<PgUser | null> {
  if (!isPostgresConfigured(env)) return null;
  const id = crypto.randomUUID();
  await pgQuery(
    env,
    `INSERT INTO users (id, firebase_uid, email, display_name)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (firebase_uid) DO UPDATE SET email = EXCLUDED.email, display_name = EXCLUDED.display_name`,
    [id, firebaseUid, email, displayName],
  );
  const rows = await pgQuery(env, `SELECT * FROM users WHERE firebase_uid = $1 LIMIT 1`, [firebaseUid]);
  const user = (rows[0] as unknown as PgUser) ?? null;
  if (user) await ensurePersonalOrg(env, user.id, email);
  return user;
}

export async function getUserByFirebaseUid(env: Env, firebaseUid: string): Promise<PgUser | null> {
  if (!isPostgresConfigured(env)) return null;
  const rows = await pgQuery(env, `SELECT * FROM users WHERE firebase_uid = $1 LIMIT 1`, [firebaseUid]);
  return (rows[0] as unknown as PgUser) ?? null;
}

export type OrgRole = "owner" | "admin" | "member" | "viewer";

export interface PgOrgMembership {
  org_id: string;
  user_id: string;
  role: OrgRole;
}

/** List organizations the user is a member of. */
export async function listOrgsForUser(env: Env, userId: string): Promise<PgOrganization[]> {
  if (!isPostgresConfigured(env)) return [];
  const rows = await pgQuery(
    env,
    `SELECT o.id, o.name, o.slug, o.owner_user_id, o.plan, o.max_seats, o.created_at
     FROM organizations o
     JOIN org_memberships m ON m.org_id = o.id AND m.user_id = $1
     WHERE m.accepted_at IS NOT NULL
     ORDER BY o.name`,
    [userId],
  );
  return rows as unknown as PgOrganization[];
}

/** Get org by id (for sync: owner_user_id). */
export async function getOrgById(
  env: Env,
  orgId: string,
): Promise<{ id: string; owner_user_id: string } | null> {
  if (!isPostgresConfigured(env)) return null;
  const rows = await pgQuery(
    env,
    `SELECT id, owner_user_id FROM organizations WHERE id = $1 LIMIT 1`,
    [orgId],
  );
  return (rows[0] as unknown as { id: string; owner_user_id: string }) ?? null;
}

/** Get user's membership in an org (role). Returns null if not a member. */
export async function getOrgMembership(
  env: Env,
  userId: string,
  orgId: string,
): Promise<PgOrgMembership | null> {
  if (!isPostgresConfigured(env)) return null;
  const rows = await pgQuery(
    env,
    `SELECT org_id, user_id, role FROM org_memberships WHERE user_id = $1 AND org_id = $2 AND accepted_at IS NOT NULL LIMIT 1`,
    [userId, orgId],
  );
  return (rows[0] as unknown as PgOrgMembership) ?? null;
}

/** Resolve org for request: X-Org-Id header or user's first org. Returns null if no access. */
export async function resolveOrgForUser(
  env: Env,
  userId: string,
  orgIdFromHeader: string | null,
): Promise<{ orgId: string; role: OrgRole } | null> {
  if (!isPostgresConfigured(env)) return null;
  if (orgIdFromHeader) {
    const m = await getOrgMembership(env, userId, orgIdFromHeader);
    if (m) return { orgId: m.org_id, role: m.role };
    return null;
  }
  const orgs = await listOrgsForUser(env, userId);
  if (orgs.length === 0) return null;
  const first = orgs[0];
  const m = await getOrgMembership(env, userId, first.id);
  return m ? { orgId: first.id, role: m.role } : null;
}

/** Require one of the allowed roles; throw if not allowed. */
export function requireRole(role: OrgRole, allowedRoles: OrgRole[]): void {
  if (!allowedRoles.includes(role)) {
    const e = new Error("Forbidden: insufficient role");
    (e as Error & { status?: number }).status = 403;
    throw e;
  }
}

export interface PgClient {
  id: string;
  org_id: string;
  name: string;
  contact_email: string | null;
  contact_name: string | null;
  notes: string | null;
  color: string | null;
  created_at: string;
}

export async function listClientsForOrg(env: Env, orgId: string): Promise<PgClient[]> {
  if (!isPostgresConfigured(env)) return [];
  const rows = await pgQuery(
    env,
    `SELECT id, org_id, name, contact_email, contact_name, notes, color, created_at FROM clients WHERE org_id = $1 ORDER BY name`,
    [orgId],
  );
  return rows as unknown as PgClient[];
}

export async function getClientById(env: Env, orgId: string, clientId: string): Promise<PgClient | null> {
  if (!isPostgresConfigured(env)) return null;
  const rows = await pgQuery(
    env,
    `SELECT id, org_id, name, contact_email, contact_name, notes, color, created_at FROM clients WHERE id = $1 AND org_id = $2 LIMIT 1`,
    [clientId, orgId],
  );
  return (rows[0] as unknown as PgClient) ?? null;
}

export async function createClient(
  env: Env,
  orgId: string,
  input: { name: string; contact_email?: string | null; contact_name?: string | null; notes?: string | null; color?: string | null },
): Promise<PgClient> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await pgQuery(
    env,
    `INSERT INTO clients (id, org_id, name, contact_email, contact_name, notes, color, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      orgId,
      input.name,
      input.contact_email ?? null,
      input.contact_name ?? null,
      input.notes ?? null,
      input.color ?? null,
      now,
    ],
  );
  const rows = await pgQuery(env, `SELECT id, org_id, name, contact_email, contact_name, notes, color, created_at FROM clients WHERE id = $1 LIMIT 1`, [id]);
  return rows[0] as unknown as PgClient;
}

export async function updateClient(
  env: Env,
  orgId: string,
  clientId: string,
  input: { name?: string; contact_email?: string | null; contact_name?: string | null; notes?: string | null; color?: string | null },
): Promise<PgClient | null> {
  const existing = await getClientById(env, orgId, clientId);
  if (!existing) return null;
  const name = input.name !== undefined ? input.name : existing.name;
  const contact_email = input.contact_email !== undefined ? input.contact_email : existing.contact_email;
  const contact_name = input.contact_name !== undefined ? input.contact_name : existing.contact_name;
  const notes = input.notes !== undefined ? input.notes : existing.notes;
  const color = input.color !== undefined ? input.color : existing.color;
  await pgQuery(
    env,
    `UPDATE clients SET name = $1, contact_email = $2, contact_name = $3, notes = $4, color = $5 WHERE id = $6 AND org_id = $7`,
    [name, contact_email, contact_name, notes, color, clientId, orgId],
  );
  return getClientById(env, orgId, clientId);
}

export async function deleteClient(env: Env, orgId: string, clientId: string): Promise<boolean> {
  const existing = await getClientById(env, orgId, clientId);
  if (!existing) return false;
  await pgQuery(env, `UPDATE domains SET client_id = NULL WHERE client_id = $1`, [clientId]);
  await pgQuery(env, `DELETE FROM clients WHERE id = $1 AND org_id = $2`, [clientId, orgId]);
  return true;
}

export interface PgOrgInvitation {
  id: string;
  org_id: string;
  email: string;
  role: OrgRole;
  token: string;
  invited_by: string;
  created_at: string;
  expires_at: string;
}

export async function createInvitation(
  env: Env,
  orgId: string,
  invitedByUserId: string,
  email: string,
  role: "admin" | "member" | "viewer",
): Promise<PgOrgInvitation> {
  const id = crypto.randomUUID();
  const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await pgQuery(
    env,
    `INSERT INTO org_invitations (id, org_id, email, role, token, invited_by, expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, orgId, email.toLowerCase().trim(), role, token, invitedByUserId, expiresAt],
  );
  const rows = await pgQuery(env, `SELECT * FROM org_invitations WHERE id = $1 LIMIT 1`, [id]);
  return rows[0] as unknown as PgOrgInvitation;
}

export async function listPendingInvitationsForOrg(env: Env, orgId: string): Promise<PgOrgInvitation[]> {
  if (!isPostgresConfigured(env)) return [];
  const rows = await pgQuery(
    env,
    `SELECT * FROM org_invitations WHERE org_id = $1 AND expires_at > NOW() ORDER BY created_at DESC`,
    [orgId],
  );
  return rows as unknown as PgOrgInvitation[];
}

export async function getInvitationByToken(env: Env, token: string): Promise<PgOrgInvitation | null> {
  if (!isPostgresConfigured(env)) return null;
  const rows = await pgQuery(
    env,
    `SELECT * FROM org_invitations WHERE token = $1 AND expires_at > NOW() LIMIT 1`,
    [token],
  );
  return (rows[0] as unknown as PgOrgInvitation) ?? null;
}

export async function acceptInvitation(
  env: Env,
  token: string,
  userId: string,
): Promise<{ orgId: string } | null> {
  const inv = await getInvitationByToken(env, token);
  if (!inv) return null;
  const membershipId = crypto.randomUUID();
  const now = new Date().toISOString();
  await pgQuery(
    env,
    `INSERT INTO org_memberships (id, org_id, user_id, role, invited_by, invited_at, accepted_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $6, $6)
     ON CONFLICT (org_id, user_id) DO UPDATE SET role = EXCLUDED.role, accepted_at = EXCLUDED.accepted_at`,
    [membershipId, inv.org_id, userId, inv.role, inv.invited_by, now],
  );
  await pgQuery(env, `DELETE FROM org_invitations WHERE id = $1`, [inv.id]);
  return { orgId: inv.org_id };
}

export async function revokeInvitation(env: Env, orgId: string, invitationId: string): Promise<boolean> {
  await pgQuery(env, `DELETE FROM org_invitations WHERE id = $1 AND org_id = $2`, [
    invitationId,
    orgId,
  ]);
  return true;
}

export interface PgProviderConnection {
  id: string;
  org_id: string;
  provider_type: string;
  display_name: string | null;
  credentials_encrypted: string | null;
  status: string;
  last_sync_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export async function listProviderConnections(env: Env, orgId: string): Promise<PgProviderConnection[]> {
  if (!isPostgresConfigured(env)) return [];
  const rows = await pgQuery(
    env,
    `SELECT id, org_id, provider_type, display_name, credentials_encrypted, status, last_sync_at, last_error, created_at, updated_at
     FROM provider_connections WHERE org_id = $1 ORDER BY created_at DESC`,
    [orgId],
  );
  return rows as unknown as PgProviderConnection[];
}

export async function getProviderConnection(
  env: Env,
  orgId: string,
  connectionId: string,
): Promise<PgProviderConnection | null> {
  if (!isPostgresConfigured(env)) return null;
  const rows = await pgQuery(
    env,
    `SELECT id, org_id, provider_type, display_name, credentials_encrypted, status, last_sync_at, last_error, created_at, updated_at
     FROM provider_connections WHERE id = $1 AND org_id = $2 LIMIT 1`,
    [connectionId, orgId],
  );
  return (rows[0] as unknown as PgProviderConnection) ?? null;
}

export async function createProviderConnection(
  env: Env,
  orgId: string,
  input: { provider_type: string; display_name?: string | null; credentials_encrypted: string },
): Promise<PgProviderConnection> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await pgQuery(
    env,
    `INSERT INTO provider_connections (id, org_id, provider_type, display_name, credentials_encrypted, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'active', $6, $6)`,
    [id, orgId, input.provider_type, input.display_name ?? null, input.credentials_encrypted, now],
  );
  const rows = await pgQuery(env, `SELECT id, org_id, provider_type, display_name, credentials_encrypted, status, last_sync_at, last_error, created_at, updated_at FROM provider_connections WHERE id = $1 LIMIT 1`, [id]);
  return rows[0] as unknown as PgProviderConnection;
}

export async function updateProviderConnectionStatus(
  env: Env,
  connectionId: string,
  status: string,
  lastError?: string | null,
  lastSyncAt?: string | null,
): Promise<void> {
  const now = new Date().toISOString();
  if (lastSyncAt !== undefined) {
    await pgQuery(
      env,
      `UPDATE provider_connections SET status = $1, last_error = $2, last_sync_at = $3, updated_at = $4 WHERE id = $5`,
      [status, lastError ?? null, lastSyncAt ?? null, now, connectionId],
    );
  } else {
    await pgQuery(
      env,
      `UPDATE provider_connections SET status = $1, last_error = $2, updated_at = $3 WHERE id = $4`,
      [status, lastError ?? null, now, connectionId],
    );
  }
}

export async function deleteProviderConnection(env: Env, orgId: string, connectionId: string): Promise<boolean> {
  await pgQuery(env, `DELETE FROM provider_connections WHERE id = $1 AND org_id = $2`, [
    connectionId,
    orgId,
  ]);
  return true;
}

export interface PgNotification {
  id: string;
  user_id: string;
  org_id: string | null;
  type: string;
  payload: string | null;
  read_at: string | null;
  created_at: string;
}

export async function listNotifications(
  env: Env,
  userId: string,
  limit = 50,
  unreadOnly = false,
): Promise<PgNotification[]> {
  if (!isPostgresConfigured(env)) return [];
  const condition = unreadOnly ? " AND read_at IS NULL" : "";
  const rows = await pgQuery(
    env,
    `SELECT id, user_id, org_id, type, payload, read_at, created_at FROM notifications WHERE user_id = $1${condition} ORDER BY created_at DESC LIMIT $2`,
    [userId, limit],
  );
  return rows as unknown as PgNotification[];
}

export async function markNotificationRead(env: Env, userId: string, notificationId: string): Promise<boolean> {
  const rows = await pgQuery(
    env,
    `UPDATE notifications SET read_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING 1`,
    [notificationId, userId],
  );
  return rows.length > 0;
}

/** Create an in-app notification. */
export async function createNotification(
  env: Env,
  userId: string,
  type: string,
  payload: string | null,
  orgId?: string | null,
): Promise<void> {
  if (!isPostgresConfigured(env)) return;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await pgQuery(
    env,
    `INSERT INTO notifications (id, user_id, org_id, type, payload, created_at) VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, userId, orgId ?? null, type, payload, now],
  );
}

/** Simple health check: run SELECT 1. Returns "ok" or "unavailable". */
export async function pgHealthCheck(env: Env): Promise<"ok" | "unavailable"> {
  if (!isPostgresConfigured(env)) return "unavailable";
  try {
    await pgQuery(env, `SELECT 1`);
    return "ok";
  } catch {
    return "unavailable";
  }
}

/** Create a sync_log row (status=running). Returns log id. */
export async function createSyncLog(
  env: Env,
  providerConnectionId: string,
  orgId: string,
): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await pgQuery(
    env,
    `INSERT INTO sync_logs (id, provider_connection_id, org_id, started_at, status) VALUES ($1, $2, $3, $4, 'running')`,
    [id, providerConnectionId, orgId, now],
  );
  return id;
}

/** Set sync_log finished_at, status, summary, error_message. */
export async function updateSyncLogFinished(
  env: Env,
  logId: string,
  status: "completed" | "failed",
  summary: string | null,
  errorMessage: string | null,
): Promise<void> {
  const now = new Date().toISOString();
  await pgQuery(
    env,
    `UPDATE sync_logs SET finished_at = $1, status = $2, summary = $3, error_message = $4 WHERE id = $5`,
    [now, status, summary, errorMessage, logId],
  );
}
