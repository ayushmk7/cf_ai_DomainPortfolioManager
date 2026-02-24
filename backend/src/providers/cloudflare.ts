/**
 * Cloudflare DNS API provider.
 * API: https://developers.cloudflare.com/api/
 * Rate limit: 1200 requests per 5 minutes.
 */

import type {
  DnsProvider,
  DnsProviderCredentials,
  DnsRecordInput,
  DnsRecordResult,
  DnsZone,
} from "./types";

const CF_API = "https://api.cloudflare.com/client/v4";

async function cfRequest<T>(
  credentials: DnsProviderCredentials,
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = credentials.apiToken ?? credentials.token;
  if (!token) throw new Error("Cloudflare API token required");
  const url = path.startsWith("http") ? path : `${CF_API}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const json = (await res.json()) as { success?: boolean; errors?: { message: string }[]; result?: T };
  if (!res.ok || !json.success) {
    const msg = json.errors?.map((e) => e.message).join("; ") ?? res.statusText;
    throw new Error(`Cloudflare API: ${msg}`);
  }
  return json.result as T;
}

export const CloudflareDnsProvider: DnsProvider = {
  type: "cloudflare",

  async testConnection(credentials: DnsProviderCredentials): Promise<boolean> {
    const data = await cfRequest<{ id: string }>(credentials, "/user/tokens/verify");
    return !!data?.id;
  },

  async listZones(credentials: DnsProviderCredentials): Promise<DnsZone[]> {
    const result = await cfRequest<{ id: string; name: string; status: string }[]>(
      credentials,
      "/zones?per_page=50"
    );
    const list = Array.isArray(result) ? result : [];
    return list.map((z) => ({ id: z.id, name: z.name, status: z.status }));
  },

  async getZone(credentials: DnsProviderCredentials, zoneId: string): Promise<DnsZone | null> {
    const z = await cfRequest<{ id: string; name: string; status: string }>(
      credentials,
      `/zones/${zoneId}`
    );
    return z ? { id: z.id, name: z.name, status: z.status } : null;
  },

  async listRecords(
    credentials: DnsProviderCredentials,
    zoneId: string
  ): Promise<DnsRecordResult[]> {
    const result = await cfRequest<{ id: string; type: string; name: string; content: string; ttl: number; priority?: number; proxied?: boolean }[]>(
      credentials,
      `/zones/${zoneId}/dns_records?per_page=100`
    );
    const list = Array.isArray(result) ? result : [];
    return list.map((r) => ({
      id: r.id,
      type: r.type,
      name: r.name,
      content: r.content,
      ttl: r.ttl ?? 3600,
      priority: r.priority,
      proxied: r.proxied,
    }));
  },

  async createRecord(
    credentials: DnsProviderCredentials,
    zoneId: string,
    record: DnsRecordInput
  ): Promise<DnsRecordResult | null> {
    const body = {
      type: record.type,
      name: record.name,
      content: record.content,
      ttl: record.ttl ?? 3600,
      priority: record.priority,
      proxied: record.proxied ?? false,
    };
    const r = await cfRequest<{ id: string; type: string; name: string; content: string; ttl: number; priority?: number; proxied?: boolean }>(
      credentials,
      `/zones/${zoneId}/dns_records`,
      { method: "POST", body: JSON.stringify(body) }
    );
    return r ? { id: r.id, type: r.type, name: r.name, content: r.content, ttl: r.ttl, priority: r.priority, proxied: r.proxied } : null;
  },

  async updateRecord(
    credentials: DnsProviderCredentials,
    zoneId: string,
    recordId: string,
    record: Partial<DnsRecordInput>
  ): Promise<DnsRecordResult | null> {
    const body: Record<string, unknown> = {};
    if (record.type) body.type = record.type;
    if (record.name) body.name = record.name;
    if (record.content) body.content = record.content;
    if (record.ttl != null) body.ttl = record.ttl;
    if (record.priority != null) body.priority = record.priority;
    if (record.proxied != null) body.proxied = record.proxied;
    const r = await cfRequest<{ id: string; type: string; name: string; content: string; ttl: number; priority?: number; proxied?: boolean }>(
      credentials,
      `/zones/${zoneId}/dns_records/${recordId}`,
      { method: "PATCH", body: JSON.stringify(body) }
    );
    return r ? { id: r.id, type: r.type, name: r.name, content: r.content, ttl: r.ttl, priority: r.priority, proxied: r.proxied } : null;
  },

  async deleteRecord(
    credentials: DnsProviderCredentials,
    zoneId: string,
    recordId: string
  ): Promise<boolean> {
    await cfRequest(credentials, `/zones/${zoneId}/dns_records/${recordId}`, {
      method: "DELETE",
    });
    return true;
  },
};
