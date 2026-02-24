/**
 * Postgres-backed data layer for the DomainPilot agent.
 * All operations are scoped by org_id (Phase 2 multi-tenant). When org_id is set we use it; otherwise fallback to user_id for backward compat.
 */

import { pgQuery } from "../db/pg";
import type { Env } from "../types";
import type {
  ChangeAction,
  ChangeLogEntry,
  ChangeSource,
  DnsRecord,
  DnsRecordType,
  DomainRecord,
  DomainStatus,
} from "../types";
import { nowIso } from "../utils/date-utils";

export interface CreateDomainInput {
  domain: string;
  registrar?: string;
  expiryDate?: string;
  notes?: string;
  status?: DomainStatus;
  clientId?: string | null;
}

/** Scope: prefer orgId when provided; otherwise userId (legacy). */
function domainWhere(orgId: string | null, userId: string): { sql: string; params: unknown[] } {
  if (orgId) {
    return { sql: `(org_id = $1 OR (org_id IS NULL AND user_id = $2))`, params: [orgId, userId] };
  }
  return { sql: `user_id = $1`, params: [userId] };
}

export async function insertDomain(
  env: Env,
  userId: string,
  input: CreateDomainInput,
  orgId?: string | null,
): Promise<DomainRecord> {
  const now = nowIso();
  const id = crypto.randomUUID();
  await pgQuery(
    env,
    `INSERT INTO domains (id, user_id, org_id, client_id, domain, registrar, expiry_date, ssl_expiry_date, status, created_at, updated_at, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, $8, $9, $9, $10)`,
    [
      id,
      userId,
      orgId ?? null,
      input.clientId ?? null,
      input.domain,
      input.registrar ?? null,
      input.expiryDate ?? null,
      input.status ?? "active",
      now,
      input.notes ?? null,
    ],
  );
  const rows = await pgQuery(env, `SELECT * FROM domains WHERE id = $1 LIMIT 1`, [id]);
  return rows[0] as unknown as DomainRecord;
}

export function getDomainByName(
  env: Env,
  userId: string,
  domain: string,
  orgId?: string | null,
): Promise<DomainRecord | null> {
  const { sql, params } = domainWhere(orgId ?? null, userId);
  return pgQuery(
    env,
    `SELECT * FROM domains WHERE ${sql} AND domain = $${params.length + 1} LIMIT 1`,
    [...params, domain],
  ).then((rows) => (rows[0] as unknown as DomainRecord) ?? null);
}

export function getDomainById(
  env: Env,
  userId: string,
  domainId: string,
  orgId?: string | null,
): Promise<DomainRecord | null> {
  const { sql, params } = domainWhere(orgId ?? null, userId);
  return pgQuery(
    env,
    `SELECT * FROM domains WHERE ${sql} AND id = $${params.length + 1} LIMIT 1`,
    [...params, domainId],
  ).then((rows) => (rows[0] as unknown as DomainRecord) ?? null);
}

export interface UpdateDomainInput {
  registrar?: string | null;
  expiryDate?: string | null;
  notes?: string | null;
  status?: DomainStatus;
  clientId?: string | null;
}

export async function updateDomain(
  env: Env,
  userId: string,
  domainName: string,
  input: UpdateDomainInput,
  orgId?: string | null,
): Promise<DomainRecord | null> {
  const existing = await getDomainByName(env, userId, domainName, orgId);
  if (!existing) return null;
  const now = nowIso();
  const registrar = input.registrar !== undefined ? input.registrar : existing.registrar;
  const expiryDate =
    input.expiryDate !== undefined ? input.expiryDate : existing.expiry_date;
  const notes = input.notes !== undefined ? input.notes : existing.notes;
  const status = input.status ?? existing.status;
  const clientId = input.clientId !== undefined ? input.clientId : (existing as { client_id?: string | null }).client_id ?? null;
  await pgQuery(
    env,
    `UPDATE domains SET registrar = $1, expiry_date = $2, notes = $3, status = $4, client_id = $5, updated_at = $6 WHERE id = $7`,
    [registrar, expiryDate, notes, status, clientId, now, existing.id],
  );
  return getDomainById(env, userId, existing.id, orgId);
}

export function listDomains(
  env: Env,
  userId: string,
  orgId?: string | null,
  clientId?: string | null,
): Promise<DomainRecord[]> {
  const { sql, params } = domainWhere(orgId ?? null, userId);
  if (clientId) {
    return pgQuery(
      env,
      `SELECT * FROM domains WHERE ${sql} AND client_id = $${params.length + 1} ORDER BY created_at DESC`,
      [...params, clientId],
    ).then((rows) => rows as unknown as DomainRecord[]);
  }
  return pgQuery(
    env,
    `SELECT * FROM domains WHERE ${sql} ORDER BY created_at DESC`,
    params,
  ).then((rows) => rows as unknown as DomainRecord[]);
}

export function countDomains(env: Env, userId: string, orgId?: string | null): Promise<number> {
  const { sql, params } = domainWhere(orgId ?? null, userId);
  return pgQuery(env, `SELECT COUNT(*) AS count FROM domains WHERE ${sql}`, params).then(
    (rows) => (rows[0]?.count as number) ?? 0,
  );
}

export function countExpiringSoon(env: Env, userId: string, days = 30, orgId?: string | null): Promise<number> {
  const { sql, params } = domainWhere(orgId ?? null, userId);
  return pgQuery(
    env,
    `SELECT COUNT(*) AS count FROM domains WHERE ${sql} AND expiry_date IS NOT NULL AND expiry_date >= NOW() AND expiry_date <= NOW() + interval '1 day' * $${params.length + 1}`,
    [...params, days],
  ).then((rows) => (rows[0]?.count as number) ?? 0);
}

export function queryDomains(
  env: Env,
  userId: string,
  query?: string,
  filter?: string,
  registrar?: string,
  orgId?: string | null,
): Promise<DomainRecord[]> {
  const { sql: scopeSql, params: scopeParams } = domainWhere(orgId ?? null, userId);
  const conditions: string[] = [scopeSql];
  const params: unknown[] = [...scopeParams];
  let paramIndex = params.length + 1;
  if (query) {
    conditions.push(`domain ILIKE $` + paramIndex++);
    params.push(`%${query}%`);
  }
  if (registrar) {
    conditions.push(`registrar = $` + paramIndex++);
    params.push(registrar);
  }
  if (filter === "inactive") {
    conditions.push(`status != 'active'`);
  }
  if (filter === "expiring_soon") {
    conditions.push(
      `expiry_date IS NOT NULL AND expiry_date >= NOW() AND expiry_date <= NOW() + interval '30 days'`,
    );
  }
  if (filter === "ssl_issues") {
    conditions.push(
      `ssl_expiry_date IS NOT NULL AND ssl_expiry_date >= NOW() AND ssl_expiry_date <= NOW() + interval '30 days'`,
    );
  }
  const whereSql = conditions.join(" AND ");
  return pgQuery(
    env,
    `SELECT * FROM domains WHERE ${whereSql} ORDER BY updated_at DESC`,
    params,
  ).then((rows) => rows as unknown as DomainRecord[]);
}

export interface UpsertDnsInput {
  domainId: string;
  subdomain?: string;
  type: DnsRecordType;
  value: string;
  ttl: number;
  priority: number | null;
}

export async function upsertDnsRecord(
  env: Env,
  userId: string,
  input: UpsertDnsInput,
): Promise<{ record: DnsRecord; action: ChangeAction; oldValue: string | null }> {
  const existing = await findDnsRecord(env, userId, input.domainId, input.subdomain ?? "", input.type);
  const now = nowIso();
  if (existing) {
    await pgQuery(
      env,
      `UPDATE dns_records SET value = $1, ttl = $2, priority = $3, updated_at = $4 WHERE id = $5`,
      [input.value, input.ttl, input.priority, now, existing.id],
    );
    const rows = await pgQuery(env, `SELECT * FROM dns_records WHERE id = $1 LIMIT 1`, [existing.id]);
    const record = rows[0] as unknown as DnsRecord;
    return { record, action: "updated", oldValue: existing.value };
  }
  const id = crypto.randomUUID();
  await pgQuery(
    env,
    `INSERT INTO dns_records (id, domain_id, user_id, subdomain, record_type, value, ttl, priority, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      id,
      input.domainId,
      userId,
      input.subdomain ?? "",
      input.type,
      input.value,
      input.ttl,
      input.priority,
      now,
      now,
    ],
  );
  const rows = await pgQuery(env, `SELECT * FROM dns_records WHERE id = $1 LIMIT 1`, [id]);
  const record = rows[0] as unknown as DnsRecord;
  return { record, action: "created", oldValue: null };
}

export function findDnsRecord(
  env: Env,
  userId: string,
  domainId: string,
  subdomain: string,
  type: DnsRecordType,
): Promise<DnsRecord | null> {
  return pgQuery(
    env,
    `SELECT * FROM dns_records WHERE domain_id = $1 AND user_id = $2 AND subdomain = $3 AND record_type = $4 LIMIT 1`,
    [domainId, userId, subdomain, type],
  ).then((rows) => (rows[0] as unknown as DnsRecord) ?? null);
}

export function getDnsRecordsForDomain(
  env: Env,
  userId: string,
  domainId: string,
  recordType?: string,
): Promise<DnsRecord[]> {
  if (recordType) {
    return pgQuery(
      env,
      `SELECT * FROM dns_records WHERE domain_id = $1 AND user_id = $2 AND record_type = $3 ORDER BY updated_at DESC`,
      [domainId, userId, recordType],
    ).then((rows) => rows as unknown as DnsRecord[]);
  }
  return pgQuery(
    env,
    `SELECT * FROM dns_records WHERE domain_id = $1 AND user_id = $2 ORDER BY updated_at DESC`,
    [domainId, userId],
  ).then((rows) => rows as unknown as DnsRecord[]);
}

export function deleteDnsRecordById(env: Env, userId: string, recordId: string): Promise<void> {
  return pgQuery(env, `DELETE FROM dns_records WHERE id = $1 AND user_id = $2`, [
    recordId,
    userId,
  ]).then(() => undefined);
}

export interface InsertChangeLogInput {
  domainId: string;
  recordId: string | null;
  action: ChangeAction;
  recordType: DnsRecordType | null;
  oldValue: string | null;
  newValue: string | null;
  source?: ChangeSource;
}

export async function insertChangeLog(
  env: Env,
  userId: string,
  input: InsertChangeLogInput,
  orgId?: string | null,
): Promise<ChangeLogEntry> {
  const id = crypto.randomUUID();
  const changedAt = nowIso();
  await pgQuery(
    env,
    `INSERT INTO dns_change_history (id, domain_id, record_id, user_id, org_id, action, record_type, old_value, new_value, changed_at, change_source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      id,
      input.domainId,
      input.recordId,
      userId,
      orgId ?? null,
      input.action,
      input.recordType,
      input.oldValue,
      input.newValue,
      changedAt,
      input.source ?? "user",
    ],
  );
  const rows = await pgQuery(env, `SELECT * FROM dns_change_history WHERE id = $1 LIMIT 1`, [id]);
  return rows[0] as unknown as ChangeLogEntry;
}

export function getDnsHistory(
  env: Env,
  userId: string,
  domainId: string,
  recordType?: string,
  limit = 20,
): Promise<ChangeLogEntry[]> {
  if (recordType) {
    return pgQuery(
      env,
      `SELECT * FROM dns_change_history WHERE domain_id = $1 AND user_id = $2 AND record_type = $3 ORDER BY changed_at DESC LIMIT $4`,
      [domainId, userId, recordType, limit],
    ).then((rows) => rows as unknown as ChangeLogEntry[]);
  }
  return pgQuery(
    env,
    `SELECT * FROM dns_change_history WHERE domain_id = $1 AND user_id = $2 ORDER BY changed_at DESC LIMIT $3`,
    [domainId, userId, limit],
  ).then((rows) => rows as unknown as ChangeLogEntry[]);
}

function historyWhere(orgId: string | null, userId: string): { sql: string; params: unknown[] } {
  if (orgId) {
    return { sql: `(org_id = $1 OR (org_id IS NULL AND user_id = $2))`, params: [orgId, userId] };
  }
  return { sql: `user_id = $1`, params: [userId] };
}

export function recentChanges(
  env: Env,
  userId: string,
  limit = 10,
  orgId?: string | null,
): Promise<ChangeLogEntry[]> {
  const { sql, params } = historyWhere(orgId ?? null, userId);
  return pgQuery(
    env,
    `SELECT * FROM dns_change_history WHERE ${sql} ORDER BY changed_at DESC LIMIT $${params.length + 1}`,
    [...params, limit],
  ).then((rows) => rows as unknown as ChangeLogEntry[]);
}

export interface ScheduledAlertRecord {
  id: string;
  domain_id: string;
  alert_type: string;
  scheduled_for: string;
  sent: number;
  message: string | null;
}

export async function insertScheduledAlert(
  env: Env,
  userId: string,
  input: { domainId: string; alertType: string; scheduledFor: string; message: string },
  orgId?: string | null,
): Promise<ScheduledAlertRecord> {
  const id = crypto.randomUUID();
  await pgQuery(
    env,
    `INSERT INTO scheduled_alerts (id, domain_id, user_id, org_id, alert_type, scheduled_for, sent, message) VALUES ($1, $2, $3, $4, $5, $6, 0, $7)`,
    [id, input.domainId, userId, orgId ?? null, input.alertType, input.scheduledFor, input.message],
  );
  const rows = await pgQuery(env, `SELECT * FROM scheduled_alerts WHERE id = $1 LIMIT 1`, [id]);
  return rows[0] as unknown as ScheduledAlertRecord;
}

export function markAlertSent(env: Env, userId: string, alertId: string): Promise<void> {
  return pgQuery(env, `UPDATE scheduled_alerts SET sent = 1 WHERE id = $1 AND user_id = $2`, [
    alertId,
    userId,
  ]).then(() => undefined);
}

function alertWhere(orgId: string | null, userId: string): { sql: string; params: unknown[] } {
  if (orgId) {
    return { sql: `(org_id = $1 OR (org_id IS NULL AND user_id = $2))`, params: [orgId, userId] };
  }
  return { sql: `user_id = $1`, params: [userId] };
}

export function listAlerts(
  env: Env,
  userId: string,
  limit = 50,
  orgId?: string | null,
): Promise<ScheduledAlertRecord[]> {
  const { sql, params } = alertWhere(orgId ?? null, userId);
  return pgQuery(
    env,
    `SELECT * FROM scheduled_alerts WHERE ${sql} ORDER BY scheduled_for DESC LIMIT $${params.length + 1}`,
    [...params, limit],
  ).then((rows) => rows as unknown as ScheduledAlertRecord[]);
}

/** Get or create domain for a provider zone (sync). */
export async function getOrCreateDomainForProviderZone(
  env: Env,
  orgId: string,
  ownerUserId: string,
  providerConnectionId: string,
  zoneId: string,
  zoneName: string,
): Promise<DomainRecord> {
  const existing = await pgQuery(
    env,
    `SELECT * FROM domains WHERE org_id = $1 AND provider_connection_id = $2 AND provider_zone_id = $3 LIMIT 1`,
    [orgId, providerConnectionId, zoneId],
  );
  if (existing.length > 0) return existing[0] as unknown as DomainRecord;
  const now = nowIso();
  const id = crypto.randomUUID();
  await pgQuery(
    env,
    `INSERT INTO domains (id, user_id, org_id, domain, provider_connection_id, provider_zone_id, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $7)`,
    [id, ownerUserId, orgId, zoneName, providerConnectionId, zoneId, now],
  );
  const rows = await pgQuery(env, `SELECT * FROM domains WHERE id = $1 LIMIT 1`, [id]);
  return rows[0] as unknown as DomainRecord;
}

/** Upsert DNS record from provider sync (by provider_record_id). */
export async function upsertDnsRecordFromProvider(
  env: Env,
  domainId: string,
  orgId: string,
  userId: string,
  providerRecordId: string,
  type: string,
  subdomain: string,
  value: string,
  ttl: number,
  priority: number | null,
): Promise<void> {
  const now = nowIso();
  const existing = await pgQuery(
    env,
    `SELECT id FROM dns_records WHERE domain_id = $1 AND provider_record_id = $2 LIMIT 1`,
    [domainId, providerRecordId],
  );
  if (existing.length > 0) {
    await pgQuery(
      env,
      `UPDATE dns_records SET record_type = $1, subdomain = $2, value = $3, ttl = $4, priority = $5, updated_at = $6, sync_status = 'synced' WHERE id = $7`,
      [type, subdomain, value, ttl, priority, now, (existing[0] as { id: string }).id],
    );
    return;
  }
  const id = crypto.randomUUID();
  await pgQuery(
    env,
    `INSERT INTO dns_records (id, domain_id, user_id, org_id, subdomain, record_type, value, ttl, priority, provider_record_id, sync_status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'synced', $11, $11)`,
    [id, domainId, userId, orgId, subdomain, type, value, ttl, priority, providerRecordId, now],
  );
}
