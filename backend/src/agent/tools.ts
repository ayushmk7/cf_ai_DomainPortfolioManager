import { z } from "zod";
import type { BulkUpdateInput, DnsRecordType, HealthReport } from "../types";
import type { DomainPilotAgent } from "./DomainPilotAgent";

export type ToolDef<TParams, TResult> = {
  description: string;
  schema: z.ZodType<TParams>;
  execute: (params: TParams) => Promise<TResult>;
};

export function createToolset(agent: DomainPilotAgent) {
  const dnsType = z.enum(["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV", "CAA"]);

  return {
    addDomain: {
      description: "Add a new domain to the portfolio",
      schema: z.object({
        domain: z.string(),
        registrar: z.string().optional(),
        expiryDate: z.string().optional(),
        notes: z.string().optional(),
      }),
      execute: async (params) => agent.addDomain(params),
    } satisfies ToolDef<{ domain: string; registrar?: string; expiryDate?: string; notes?: string }, Record<string, unknown>>,
    updateDomain: {
      description: "Update an existing domain's metadata (registrar, expiry date, notes, status)",
      schema: z.object({
        domain: z.string(),
        registrar: z.string().nullable().optional(),
        expiryDate: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
        status: z.enum(["active", "parked", "for_sale", "expired"]).optional(),
      }),
      execute: async (params) => agent.updateDomain(params),
    } satisfies ToolDef<
      {
        domain: string;
        registrar?: string | null;
        expiryDate?: string | null;
        notes?: string | null;
        status?: "active" | "parked" | "for_sale" | "expired";
      },
      Record<string, unknown>
    >,
    addDnsRecord: {
      description: "Add or update a DNS record",
      schema: z.object({
        domain: z.string(),
        subdomain: z.string().optional(),
        type: dnsType,
        value: z.string(),
        ttl: z.number().int().optional(),
        priority: z.number().int().optional(),
      }),
      execute: async (params) =>
        agent.addDnsRecord({
          ...params,
          type: params.type as DnsRecordType,
        }),
    } satisfies ToolDef<
      { domain: string; subdomain?: string; type: z.infer<typeof dnsType>; value: string; ttl?: number; priority?: number },
      Record<string, unknown>
    >,
    deleteDnsRecord: {
      description: "Delete a DNS record (approval required)",
      schema: z.object({
        domain: z.string(),
        subdomain: z.string().optional(),
        type: dnsType,
      }),
      execute: async (params) => agent.deleteDnsRecord({ ...params, type: params.type as DnsRecordType }),
    } satisfies ToolDef<{ domain: string; subdomain?: string; type: z.infer<typeof dnsType> }, Record<string, unknown>>,
    queryDomains: {
      description: "Query and filter domains",
      schema: z.object({
        query: z.string().optional(),
        filter: z.enum(["all", "expiring_soon", "ssl_issues", "inactive"]).optional(),
        registrar: z.string().optional(),
      }),
      execute: async (params) => agent.queryDomains(params),
    } satisfies ToolDef<{ query?: string; filter?: "all" | "expiring_soon" | "ssl_issues" | "inactive"; registrar?: string }, Record<string, unknown>>,
    getDnsRecords: {
      description: "Retrieve DNS records for a domain",
      schema: z.object({
        domain: z.string(),
        recordType: z.string().optional(),
      }),
      execute: async (params) => agent.getDnsRecords(params),
    } satisfies ToolDef<{ domain: string; recordType?: string }, Record<string, unknown>>,
    getDnsHistory: {
      description: "Get DNS change history",
      schema: z.object({
        domain: z.string(),
        recordType: z.string().optional(),
        limit: z.number().int().optional(),
      }),
      execute: async (params) => agent.getDnsHistoryTool(params),
    } satisfies ToolDef<{ domain: string; recordType?: string; limit?: number }, Record<string, unknown>>,
    searchHistory: {
      description: "Semantic search over history",
      schema: z.object({
        query: z.string(),
      }),
      execute: async (params) => agent.searchHistory(params),
    } satisfies ToolDef<{ query: string }, Record<string, unknown>>,
    checkDomainHealth: {
      description: "Run domain health checks",
      schema: z.object({
        domain: z.string(),
      }),
      execute: async (params) => agent.checkDomainHealthTool(params),
    } satisfies ToolDef<{ domain: string }, HealthReport>,
    bulkUpdate: {
      description: "Plan and execute bulk DNS updates (approval required)",
      schema: z.object({
        description: z.string(),
        domains: z.array(z.string()).optional(),
      }),
      execute: async (params) => agent.bulkUpdate(params as BulkUpdateInput),
    } satisfies ToolDef<{ description: string; domains?: string[] }, Record<string, unknown>>,
    getAlerts: {
      description: "List scheduled and sent alerts",
      schema: z.object({
        limit: z.number().int().optional(),
      }),
      execute: async (params) => agent.getAlerts(params),
    } satisfies ToolDef<{ limit?: number }, Record<string, unknown>>,
    handleApprovalResponse: {
      description: "Resolve a pending approval request",
      schema: z.object({
        approvalId: z.string(),
        approved: z.boolean(),
      }),
      execute: async (params) => agent.handleApprovalResponse(params.approvalId, params.approved),
    } satisfies ToolDef<{ approvalId: string; approved: boolean }, { ok: boolean }>,
  };
}
