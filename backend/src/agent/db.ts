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

export interface SqlExecutor {
  exec: (query: string, ...bindings: unknown[]) => Iterable<unknown>;
}

function rows<T>(iterable: Iterable<unknown>): T[] {
  return Array.from(iterable) as T[];
}

export function ensureTablesExist(sql: SqlExecutor): void {
  sql.exec(`
    CREATE TABLE IF NOT EXISTS domains (
      id TEXT PRIMARY KEY,
      domain TEXT NOT NULL UNIQUE,
      registrar TEXT,
      expiry_date TEXT,
      ssl_expiry_date TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      notes TEXT
    );
  `);

  sql.exec(`
    CREATE TABLE IF NOT EXISTS dns_records (
      id TEXT PRIMARY KEY,
      domain_id TEXT NOT NULL REFERENCES domains(id),
      subdomain TEXT DEFAULT '',
      record_type TEXT NOT NULL,
      value TEXT NOT NULL,
      ttl INTEGER DEFAULT 3600,
      priority INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  sql.exec(`
    CREATE TABLE IF NOT EXISTS dns_change_history (
      id TEXT PRIMARY KEY,
      domain_id TEXT NOT NULL REFERENCES domains(id),
      record_id TEXT,
      action TEXT NOT NULL,
      record_type TEXT,
      old_value TEXT,
      new_value TEXT,
      changed_at TEXT NOT NULL,
      change_source TEXT DEFAULT 'user'
    );
  `);

  sql.exec(`
    CREATE TABLE IF NOT EXISTS scheduled_alerts (
      id TEXT PRIMARY KEY,
      domain_id TEXT NOT NULL REFERENCES domains(id),
      alert_type TEXT NOT NULL,
      scheduled_for TEXT NOT NULL,
      sent INTEGER DEFAULT 0,
      message TEXT
    );
  `);

  sql.exec(`CREATE INDEX IF NOT EXISTS idx_domains_expiry ON domains(expiry_date);`);
  sql.exec(`CREATE INDEX IF NOT EXISTS idx_dns_domain ON dns_records(domain_id);`);
  sql.exec(`CREATE INDEX IF NOT EXISTS idx_history_domain_time ON dns_change_history(domain_id, changed_at DESC);`);
}

export interface CreateDomainInput {
  domain: string;
  registrar?: string;
  expiryDate?: string;
  notes?: string;
  status?: DomainStatus;
}

export function insertDomain(sql: SqlExecutor, input: CreateDomainInput): DomainRecord {
  const now = nowIso();
  const id = crypto.randomUUID();
  sql.exec(
    `INSERT INTO domains (id, domain, registrar, expiry_date, ssl_expiry_date, status, created_at, updated_at, notes)
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
    id,
    input.domain,
    input.registrar ?? null,
    input.expiryDate ?? null,
    input.status ?? "active",
    now,
    now,
    input.notes ?? null,
  );
  return getDomainByName(sql, input.domain)!;
}

export function getDomainByName(sql: SqlExecutor, domain: string): DomainRecord | null {
  const result = rows<DomainRecord>(sql.exec(`SELECT * FROM domains WHERE domain = ? LIMIT 1`, domain));
  return result[0] ?? null;
}

export function getDomainById(sql: SqlExecutor, domainId: string): DomainRecord | null {
  const result = rows<DomainRecord>(sql.exec(`SELECT * FROM domains WHERE id = ? LIMIT 1`, domainId));
  return result[0] ?? null;
}

export interface UpdateDomainInput {
  registrar?: string | null;
  expiryDate?: string | null;
  notes?: string | null;
  status?: import("../types").DomainStatus;
}

export function updateDomain(
  sql: SqlExecutor,
  domainName: string,
  input: UpdateDomainInput,
): DomainRecord | null {
  const existing = getDomainByName(sql, domainName);
  if (!existing) return null;
  const now = nowIso();
  const registrar = input.registrar !== undefined ? input.registrar : existing.registrar;
  const expiryDate =
    input.expiryDate !== undefined ? input.expiryDate : existing.expiry_date;
  const notes = input.notes !== undefined ? input.notes : existing.notes;
  const status = input.status ?? existing.status;
  sql.exec(
    `UPDATE domains SET registrar = ?, expiry_date = ?, notes = ?, status = ?, updated_at = ? WHERE id = ?`,
    registrar,
    expiryDate,
    notes,
    status,
    now,
    existing.id,
  );
  return getDomainById(sql, existing.id);
}

export function listDomains(sql: SqlExecutor): DomainRecord[] {
  return rows<DomainRecord>(sql.exec(`SELECT * FROM domains ORDER BY created_at DESC`));
}

export function queryDomains(sql: SqlExecutor, query?: string, filter?: string, registrar?: string): DomainRecord[] {
  const where: string[] = [];
  const params: unknown[] = [];

  if (query) {
    where.push(`domain LIKE ?`);
    params.push(`%${query}%`);
  }
  if (registrar) {
    where.push(`registrar = ?`);
    params.push(registrar);
  }
  if (filter === "inactive") {
    where.push(`status != 'active'`);
  }
  if (filter === "expiring_soon") {
    where.push(`expiry_date IS NOT NULL AND julianday(expiry_date) - julianday('now') <= 30`);
  }
  if (filter === "ssl_issues") {
    where.push(`ssl_expiry_date IS NOT NULL AND julianday(ssl_expiry_date) - julianday('now') <= 30`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  return rows<DomainRecord>(sql.exec(`SELECT * FROM domains ${whereSql} ORDER BY updated_at DESC`, ...params));
}

export interface UpsertDnsInput {
  domainId: string;
  subdomain?: string;
  type: DnsRecordType;
  value: string;
  ttl: number;
  priority: number | null;
}

export function upsertDnsRecord(sql: SqlExecutor, input: UpsertDnsInput): { record: DnsRecord; action: ChangeAction; oldValue: string | null } {
  const existing = rows<DnsRecord>(
    sql.exec(
      `SELECT * FROM dns_records WHERE domain_id = ? AND subdomain = ? AND record_type = ? LIMIT 1`,
      input.domainId,
      input.subdomain ?? "",
      input.type,
    ),
  )[0];

  const now = nowIso();
  if (existing) {
    sql.exec(
      `UPDATE dns_records SET value = ?, ttl = ?, priority = ?, updated_at = ? WHERE id = ?`,
      input.value,
      input.ttl,
      input.priority,
      now,
      existing.id,
    );
    const record = rows<DnsRecord>(sql.exec(`SELECT * FROM dns_records WHERE id = ? LIMIT 1`, existing.id))[0];
    return { record, action: "updated", oldValue: existing.value };
  }

  const id = crypto.randomUUID();
  sql.exec(
    `INSERT INTO dns_records (id, domain_id, subdomain, record_type, value, ttl, priority, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.domainId,
    input.subdomain ?? "",
    input.type,
    input.value,
    input.ttl,
    input.priority,
    now,
    now,
  );
  const record = rows<DnsRecord>(sql.exec(`SELECT * FROM dns_records WHERE id = ? LIMIT 1`, id))[0];
  return { record, action: "created", oldValue: null };
}

export function getDnsRecordsForDomain(sql: SqlExecutor, domainId: string, recordType?: string): DnsRecord[] {
  if (recordType) {
    return rows<DnsRecord>(
      sql.exec(
        `SELECT * FROM dns_records WHERE domain_id = ? AND record_type = ? ORDER BY updated_at DESC`,
        domainId,
        recordType,
      ),
    );
  }
  return rows<DnsRecord>(sql.exec(`SELECT * FROM dns_records WHERE domain_id = ? ORDER BY updated_at DESC`, domainId));
}

export function findDnsRecord(sql: SqlExecutor, domainId: string, subdomain: string, type: DnsRecordType): DnsRecord | null {
  const result = rows<DnsRecord>(
    sql.exec(
      `SELECT * FROM dns_records WHERE domain_id = ? AND subdomain = ? AND record_type = ? LIMIT 1`,
      domainId,
      subdomain,
      type,
    ),
  );
  return result[0] ?? null;
}

export function deleteDnsRecordById(sql: SqlExecutor, recordId: string): void {
  sql.exec(`DELETE FROM dns_records WHERE id = ?`, recordId);
}

export function insertChangeLog(
  sql: SqlExecutor,
  input: {
    domainId: string;
    recordId: string | null;
    action: ChangeAction;
    recordType: DnsRecordType | null;
    oldValue: string | null;
    newValue: string | null;
    source?: ChangeSource;
  },
): ChangeLogEntry {
  const id = crypto.randomUUID();
  const changedAt = nowIso();
  sql.exec(
    `INSERT INTO dns_change_history (id, domain_id, record_id, action, record_type, old_value, new_value, changed_at, change_source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.domainId,
    input.recordId,
    input.action,
    input.recordType,
    input.oldValue,
    input.newValue,
    changedAt,
    input.source ?? "user",
  );
  return rows<ChangeLogEntry>(sql.exec(`SELECT * FROM dns_change_history WHERE id = ? LIMIT 1`, id))[0];
}

export function getDnsHistory(sql: SqlExecutor, domainId: string, recordType?: string, limit = 20): ChangeLogEntry[] {
  if (recordType) {
    return rows<ChangeLogEntry>(
      sql.exec(
        `SELECT * FROM dns_change_history WHERE domain_id = ? AND record_type = ? ORDER BY changed_at DESC LIMIT ?`,
        domainId,
        recordType,
        limit,
      ),
    );
  }
  return rows<ChangeLogEntry>(
    sql.exec(`SELECT * FROM dns_change_history WHERE domain_id = ? ORDER BY changed_at DESC LIMIT ?`, domainId, limit),
  );
}

export interface ScheduledAlertRecord {
  id: string;
  domain_id: string;
  alert_type: string;
  scheduled_for: string;
  sent: number;
  message: string | null;
}

export function insertScheduledAlert(
  sql: SqlExecutor,
  input: { domainId: string; alertType: string; scheduledFor: string; message: string },
): ScheduledAlertRecord {
  const id = crypto.randomUUID();
  sql.exec(
    `INSERT INTO scheduled_alerts (id, domain_id, alert_type, scheduled_for, sent, message) VALUES (?, ?, ?, ?, 0, ?)`,
    id,
    input.domainId,
    input.alertType,
    input.scheduledFor,
    input.message,
  );
  return rows<ScheduledAlertRecord>(sql.exec(`SELECT * FROM scheduled_alerts WHERE id = ? LIMIT 1`, id))[0];
}

export function markAlertSent(sql: SqlExecutor, alertId: string): void {
  sql.exec(`UPDATE scheduled_alerts SET sent = 1 WHERE id = ?`, alertId);
}

export function listAlerts(sql: SqlExecutor, limit = 50): ScheduledAlertRecord[] {
  return rows<ScheduledAlertRecord>(
    sql.exec(`SELECT * FROM scheduled_alerts ORDER BY scheduled_for DESC LIMIT ?`, limit),
  );
}

export function countDomains(sql: SqlExecutor): number {
  const result = rows<{ count: number }>(sql.exec(`SELECT COUNT(*) AS count FROM domains`));
  return result[0]?.count ?? 0;
}

export function countExpiringSoon(sql: SqlExecutor, days = 30): number {
  const result = rows<{ count: number }>(
    sql.exec(
      `SELECT COUNT(*) AS count FROM domains WHERE expiry_date IS NOT NULL AND julianday(expiry_date) - julianday('now') BETWEEN 0 AND ?`,
      days,
    ),
  );
  return result[0]?.count ?? 0;
}

export function recentChanges(sql: SqlExecutor, limit = 10): ChangeLogEntry[] {
  return rows<ChangeLogEntry>(sql.exec(`SELECT * FROM dns_change_history ORDER BY changed_at DESC LIMIT ?`, limit));
}
