/**
 * Stub DNS providers (GoDaddy, Namecheap, Route53, Vercel).
 * Implement the interface but return "not implemented" until full integration.
 */

import type {
  DnsProvider,
  DnsProviderCredentials,
  DnsRecordInput,
  DnsRecordResult,
  DnsZone,
} from "./types";

function notImplemented(): never {
  throw new Error("Provider not yet implemented");
}

function createStub(type: string): DnsProvider {
  return {
    type,
    async testConnection() {
      notImplemented();
    },
    async listZones() {
      notImplemented();
    },
    async getZone() {
      notImplemented();
    },
    async listRecords(_c: DnsProviderCredentials, _zoneId: string) {
      notImplemented();
    },
    async createRecord(
      _c: DnsProviderCredentials,
      _zoneId: string,
      _record: DnsRecordInput
    ): Promise<DnsRecordResult | null> {
      notImplemented();
    },
    async updateRecord() {
      notImplemented();
    },
    async deleteRecord() {
      notImplemented();
    },
  };
}

export const GoDaddyDnsProvider = createStub("godaddy");
export const NamecheapDnsProvider = createStub("namecheap");
export const Route53DnsProvider = createStub("route53");
export const VercelDnsProvider = createStub("vercel");
