/**
 * DNS provider abstraction for Phase 2.
 * All providers implement this interface.
 */

export interface DnsZone {
  id: string;
  name: string;
  status?: string;
}

export interface DnsRecordInput {
  type: string;
  name: string;
  content: string;
  ttl?: number;
  priority?: number;
  proxied?: boolean;
}

export interface DnsRecordResult {
  id: string;
  type: string;
  name: string;
  content: string;
  ttl: number;
  priority?: number;
  proxied?: boolean;
}

export interface SyncResult {
  zonesImported: number;
  recordsUpdated: number;
  errors: string[];
}

export interface DnsProviderCredentials {
  [key: string]: string;
}

export interface DnsProvider {
  readonly type: string;
  testConnection(credentials: DnsProviderCredentials): Promise<boolean>;
  listZones(credentials: DnsProviderCredentials): Promise<DnsZone[]>;
  getZone(credentials: DnsProviderCredentials, zoneId: string): Promise<DnsZone | null>;
  listRecords(credentials: DnsProviderCredentials, zoneId: string): Promise<DnsRecordResult[]>;
  createRecord(
    credentials: DnsProviderCredentials,
    zoneId: string,
    record: DnsRecordInput
  ): Promise<DnsRecordResult | null>;
  updateRecord(
    credentials: DnsProviderCredentials,
    zoneId: string,
    recordId: string,
    record: Partial<DnsRecordInput>
  ): Promise<DnsRecordResult | null>;
  deleteRecord(
    credentials: DnsProviderCredentials,
    zoneId: string,
    recordId: string
  ): Promise<boolean>;
}
