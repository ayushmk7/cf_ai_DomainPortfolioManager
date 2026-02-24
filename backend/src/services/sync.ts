/**
 * Provider sync: import zones as domains and records into the DB, write sync_logs.
 */

import * as dbPg from "../agent/db-pg";
import { createSyncLog, getOrgById, getProviderConnection, updateSyncLogFinished } from "../db/pg";
import { getProvider } from "../providers/registry";
import type { Env } from "../types";
import type { DnsRecordResult, DnsZone } from "../providers/types";

function subdomainFromRecordName(recordName: string, zoneName: string): string {
  const r = recordName.endsWith(".") ? recordName.slice(0, -1) : recordName;
  const z = zoneName.endsWith(".") ? zoneName.slice(0, -1) : zoneName;
  if (r === z) return "";
  const suffix = `.${z}`;
  if (r.endsWith(suffix)) return r.slice(0, r.length - suffix.length);
  return r;
}

export interface SyncResult {
  ok: boolean;
  logId: string;
  zonesImported: number;
  recordsUpdated: number;
  error?: string;
}

export async function runProviderSync(
  env: Env,
  orgId: string,
  connectionId: string,
  credentials: Record<string, string>,
): Promise<SyncResult> {
  const conn = await getProviderConnection(env, orgId, connectionId);
  if (!conn) {
    return { ok: false, logId: "", zonesImported: 0, recordsUpdated: 0, error: "Connection not found" };
  }
  const provider = getProvider(conn.provider_type);
  if (!provider) {
    return { ok: false, logId: "", zonesImported: 0, recordsUpdated: 0, error: "Provider type not available" };
  }
  const logId = await createSyncLog(env, connectionId, orgId);
  const org = await getOrgById(env, orgId);
  if (!org) {
    await updateSyncLogFinished(env, logId, "failed", null, "Org not found");
    return { ok: false, logId, zonesImported: 0, recordsUpdated: 0, error: "Org not found" };
  }
  const ownerUserId = org.owner_user_id;
  let zonesImported = 0;
  let recordsUpdated = 0;
  try {
    const zones = await provider.listZones(credentials) as DnsZone[];
    for (const zone of zones) {
      const domain = await dbPg.getOrCreateDomainForProviderZone(
        env,
        orgId,
        ownerUserId,
        connectionId,
        zone.id,
        zone.name,
      );
      zonesImported++;
      const records = await provider.listRecords(credentials, zone.id) as DnsRecordResult[];
      for (const rec of records) {
        const sub = subdomainFromRecordName(rec.name, zone.name);
        await dbPg.upsertDnsRecordFromProvider(
          env,
          domain.id,
          orgId,
          ownerUserId,
          rec.id,
          rec.type,
          sub,
          rec.content,
          rec.ttl ?? 3600,
          rec.priority ?? null,
        );
        recordsUpdated++;
      }
    }
    await updateSyncLogFinished(
      env,
      logId,
      "completed",
      `Zones: ${zonesImported}, records: ${recordsUpdated}`,
      null,
    );
    return { ok: true, logId, zonesImported, recordsUpdated };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await updateSyncLogFinished(env, logId, "failed", null, msg);
    return { ok: false, logId, zonesImported, recordsUpdated, error: msg };
  }
}
