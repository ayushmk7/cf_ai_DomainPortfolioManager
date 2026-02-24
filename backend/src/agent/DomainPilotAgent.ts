import { streamText } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import * as dbPg from "./db-pg";
import { isPostgresConfigured } from "../db/pg";
import { createToolset } from "./tools";
import { DOMAIN_MANAGER_SYSTEM_PROMPT } from "./prompts";
import type {
  BulkUpdateInput,
  ChangeLogEntry,
  DomainOnboardingInput,
  DomainPilotState,
  DnsRecord,
  DnsRecordType,
  Env,
  HealthReport,
  PendingAction,
} from "../types";
import { daysUntil, isWithinDays, nowIso, toIsoDate } from "../utils/date-utils";
import { assertPriorityIfRequired, assertValidRecordValue, assertValidTtl } from "../utils/dns-validator";
import { assertValidDomain } from "../utils/domain-validator";
import { normalizeError } from "../utils/errors";
import { withRetry } from "../utils/retry";

type ApprovalResolve = (approved: boolean) => void;
type Toolset = ReturnType<typeof createToolset>;
type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

const PG_USER_ID_HEADER = "X-PG-User-Id";
const ORG_ID_HEADER = "X-Org-Id";

const MAX_TOOL_ITERATIONS = 10;

/** OpenAI-format tool definitions for function calling. */
function getOpenAITools(): { type: "function"; function: { name: string; description: string; parameters: object } }[] {
  return [
    {
      type: "function",
      function: {
        name: "addDomain",
        description: "Add a new domain to the portfolio",
        parameters: {
          type: "object",
          properties: {
            domain: { type: "string" },
            registrar: { type: "string" },
            expiryDate: { type: "string" },
            notes: { type: "string" },
          },
          required: ["domain"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "updateDomain",
        description: "Update an existing domain's metadata (registrar, expiry date, notes, status)",
        parameters: {
          type: "object",
          properties: {
            domain: { type: "string" },
            registrar: { type: "string" },
            expiryDate: { type: "string" },
            notes: { type: "string" },
            status: { type: "string", enum: ["active", "parked", "for_sale", "expired"] },
          },
          required: ["domain"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "addDnsRecord",
        description: "Add or update a DNS record",
        parameters: {
          type: "object",
          properties: {
            domain: { type: "string" },
            subdomain: { type: "string" },
            type: { type: "string", enum: ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV", "CAA"] },
            value: { type: "string" },
            ttl: { type: "number" },
            priority: { type: "number" },
          },
          required: ["domain", "type", "value"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "deleteDnsRecord",
        description: "Delete a DNS record (approval required)",
        parameters: {
          type: "object",
          properties: {
            domain: { type: "string" },
            subdomain: { type: "string" },
            type: { type: "string", enum: ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV", "CAA"] },
          },
          required: ["domain", "type"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "queryDomains",
        description: "Query and filter domains",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string" },
            filter: { type: "string", enum: ["all", "expiring_soon", "ssl_issues", "inactive"] },
            registrar: { type: "string" },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "getDnsRecords",
        description: "Retrieve DNS records for a domain",
        parameters: {
          type: "object",
          properties: { domain: { type: "string" }, recordType: { type: "string" } },
          required: ["domain"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "getDnsHistory",
        description: "Get DNS change history",
        parameters: {
          type: "object",
          properties: {
            domain: { type: "string" },
            recordType: { type: "string" },
            limit: { type: "number" },
          },
          required: ["domain"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "searchHistory",
        description: "Semantic search over history",
        parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
      },
    },
    {
      type: "function",
      function: {
        name: "checkDomainHealth",
        description: "Run domain health checks",
        parameters: { type: "object", properties: { domain: { type: "string" } }, required: ["domain"] },
      },
    },
    {
      type: "function",
      function: {
        name: "bulkUpdate",
        description: "Plan and execute bulk DNS updates (approval required)",
        parameters: {
          type: "object",
          properties: { description: { type: "string" }, domains: { type: "array", items: { type: "string" } } },
          required: ["description"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "getAlerts",
        description: "List scheduled and sent alerts",
        parameters: { type: "object", properties: { limit: { type: "number" } } },
      },
    },
    {
      type: "function",
      function: {
        name: "handleApprovalResponse",
        description: "Resolve a pending approval request",
        parameters: {
          type: "object",
          properties: { approvalId: { type: "string" }, approved: { type: "boolean" } },
          required: ["approvalId", "approved"],
        },
      },
    },
  ];
}

const DEFAULT_STATE: DomainPilotState = {
  domainCount: 0,
  domainsExpiringSoon: 0,
  lastHealthCheck: null,
  pendingApprovals: [],
  recentChanges: [],
  alertsEnabled: true,
};

export class DomainPilotAgent {
  private approvalCallbacks = new Map<string, ApprovalResolve>();
  private stateData: DomainPilotState = { ...DEFAULT_STATE };
  private initialized = false;
  private readonly tools: Toolset;
  /** Set from request header; used to scope Postgres queries when present. */
  private pgUserId: string | null = null;
  /** Set from request header (X-Org-Id); used for org-scoped queries. */
  private pgOrgId: string | null = null;

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
  ) {
    this.tools = createToolset(this);
  }

  private usePg(): boolean {
    return this.pgUserId !== null && isPostgresConfigured(this.env);
  }

  /** Throws if Postgres is not configured; use for all domain/DNS/alert data operations. */
  private requirePg(): void {
    if (!this.usePg()) {
      throw new Error("Postgres is required for domain data. Please sign in and ensure DATABASE_URL is set.");
    }
  }

  private async loadState(): Promise<void> {
    if (this.initialized) return;
    const saved = await this.state.storage.get<DomainPilotState>("agent_state");
    this.stateData = saved ?? { ...DEFAULT_STATE };
    this.initialized = true;
    this.scheduleRecurringJobs();
    await this.refreshState();
  }

  private async setState(next: DomainPilotState): Promise<void> {
    this.stateData = next;
    await this.state.storage.put("agent_state", next);
  }

  private scheduleRecurringJobs(): void {
    // Native cron or Agents schedule can be added later.
    // Kept as no-op placeholder to preserve callback naming contract.
  }

  async fetch(request: Request): Promise<Response> {
    this.pgUserId = request.headers.get(PG_USER_ID_HEADER);
    this.pgOrgId = request.headers.get(ORG_ID_HEADER);
    await this.loadState();
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/agent/state") {
      return Response.json({ ok: true, state: this.stateData });
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const body = await request.json() as {
      action?: string;
      messages?: ChatMessage[];
      toolName?: string;
      params?: Record<string, unknown>;
    };

    if (body.action === "chat") {
      try {
        const text = await this.onChatMessage(body.messages ?? []);
        return Response.json({ ok: true, text, state: this.stateData });
      } catch (error) {
        const normalized = normalizeError(error);
        console.error("chat_error", normalized);
        return Response.json({ ok: false, error: normalized.message, kind: normalized.kind }, { status: 500 });
      }
    }

    if (body.action === "tool" && body.toolName) {
      try {
        const tool = this.tools[body.toolName as keyof Toolset];
        if (!tool) return Response.json({ ok: false, error: `Unknown tool: ${body.toolName}` }, { status: 400 });
        const params = tool.schema.parse(body.params ?? {});
        const result = await tool.execute(params as never);
        console.info("tool_execution", { toolName: body.toolName, ok: true });
        return Response.json({ ok: true, result, state: this.stateData });
      } catch (error) {
        const normalized = normalizeError(error);
        console.error("tool_execution", { toolName: body.toolName, ok: false, ...normalized });
        return Response.json({ ok: false, error: normalized.message, kind: normalized.kind }, { status: 400 });
      }
    }

    return Response.json({ ok: false, error: "Unknown action" }, { status: 400 });
  }

  async onChatMessage(messages: ChatMessage[]): Promise<string> {
    if (this.env.OPENAI_API_KEY) {
      return this.chatViaOpenAI(messages);
    }
    const workersai = createWorkersAI({ binding: this.env.AI });
    const text = await withRetry(async () => {
      const result = streamText({
        model: workersai("@cf/meta/llama-3.3-70b-instruct-fp8-fast" as never),
        system: DOMAIN_MANAGER_SYSTEM_PROMPT,
        messages: messages as never,
      });
      return result.text;
    });
    return text;
  }

  private async chatViaOpenAI(messages: ChatMessage[]): Promise<string> {
    const apiKey = this.env.OPENAI_API_KEY!;
    const tools = getOpenAITools();
    type OpenAIMessage =
      | { role: "system"; content: string }
      | { role: "user"; content: string }
      | { role: "assistant"; content: string | null; tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[] }
      | { role: "tool"; tool_call_id: string; content: string };

    let conversation: OpenAIMessage[] = [
      { role: "system", content: DOMAIN_MANAGER_SYSTEM_PROMPT },
      ...messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    ];

    for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
      const body: Record<string, unknown> = {
        model: "gpt-4o-mini",
        messages: conversation,
      };
      if (tools.length > 0) {
        body.tools = tools;
        body.tool_choice = "auto";
      }

      const res = await withRetry(async () => {
        const r = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
        });
        if (!r.ok) {
          const err = await r.text();
          throw new Error(`OpenAI API error ${r.status}: ${err}`);
        }
        return r;
      });
      const data = (await res.json()) as {
        choices: { message: { content: string | null; tool_calls?: { id: string; type: string; function: { name: string; arguments: string } }[] } }[];
      };
      const choice = data.choices?.[0]?.message;
      if (!choice) return "No response from OpenAI.";

      const assistantContent = choice.content ?? null;
      const toolCalls = choice.tool_calls;

      if (!toolCalls || toolCalls.length === 0) {
        return assistantContent ?? "Done.";
      }

      conversation.push({
        role: "assistant",
        content: assistantContent,
        tool_calls: toolCalls.map((tc) => ({ id: tc.id, type: "function" as const, function: tc.function })),
      });

      for (const tc of toolCalls) {
        const toolName = tc.function.name;
        const tool = this.tools[toolName as keyof Toolset];
        let toolResult: string;
        if (!tool) {
          toolResult = JSON.stringify({ error: `Unknown tool: ${toolName}` });
        } else {
          try {
            const args = JSON.parse(tc.function.arguments || "{}") as Record<string, unknown>;
            const params = tool.schema.parse(args);
            const result = await tool.execute(params as never);
            toolResult = JSON.stringify(result);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            toolResult = JSON.stringify({ error: msg });
          }
        }
        conversation.push({
          role: "tool",
          tool_call_id: tc.id,
          content: toolResult,
        });
      }
    }

    return "Reached maximum tool-call iterations. Please try a simpler request.";
  }

  async refreshState(): Promise<void> {
    if (this.usePg() && this.pgUserId) {
      const [domainCount, domainsExpiringSoon, recentChangesList] = await Promise.all([
        dbPg.countDomains(this.env, this.pgUserId, this.pgOrgId),
        dbPg.countExpiringSoon(this.env, this.pgUserId, 30, this.pgOrgId),
        dbPg.recentChanges(this.env, this.pgUserId, 10, this.pgOrgId),
      ]);
      await this.setState({
        ...this.stateData,
        domainCount: domainCount,
        domainsExpiringSoon: domainsExpiringSoon,
        recentChanges: recentChangesList,
      });
      return;
    }
    await this.setState({
      ...this.stateData,
      domainCount: 0,
      domainsExpiringSoon: 0,
      recentChanges: [],
    });
  }

  async addDomain(input: DomainOnboardingInput): Promise<Record<string, unknown>> {
    this.requirePg();
    const domain = assertValidDomain(input.domain);
    const expiryDate = input.expiryDate ? toIsoDate(input.expiryDate) : undefined;
    const existing = await dbPg.getDomainByName(this.env, this.pgUserId!, domain, this.pgOrgId);
    if (existing) return { ok: true, created: false, domain: existing };
    const created = await dbPg.insertDomain(this.env, this.pgUserId!, {
      domain,
      registrar: input.registrar,
      expiryDate,
      notes: input.notes,
    }, this.pgOrgId);
    if (expiryDate) await this.scheduleExpiryReminders(domain, expiryDate);
    await this.triggerDomainOnboardingWorkflow({ ...input, domain, expiryDate });
    await this.refreshState();
    return { ok: true, created: true, domain: created };
  }

  async updateDomain(input: {
    domain: string;
    registrar?: string | null;
    expiryDate?: string | null;
    notes?: string | null;
    status?: "active" | "parked" | "for_sale" | "expired";
  }): Promise<Record<string, unknown>> {
    this.requirePg();
    const domainName = assertValidDomain(input.domain);
    const expiryDate =
      input.expiryDate === undefined
        ? undefined
        : input.expiryDate === "" || input.expiryDate === null
          ? null
          : toIsoDate(input.expiryDate);
    const updated = await dbPg.updateDomain(this.env, this.pgUserId!, domainName, {
      registrar: input.registrar,
      expiryDate,
      notes: input.notes,
      status: input.status,
    }, this.pgOrgId);
    if (!updated) throw new Error(`Domain not found: ${domainName}`);
    await this.refreshState();
    return { ok: true, domain: updated };
  }

  async addDnsRecord(input: {
    domain: string;
    subdomain?: string;
    type: DnsRecordType;
    value: string;
    ttl?: number;
    priority?: number;
    source?: "user" | "bulk_update" | "import";
  }): Promise<Record<string, unknown>> {
    this.requirePg();
    const domainName = assertValidDomain(input.domain);
    const value = assertValidRecordValue(input.type, input.value);
    const ttl = assertValidTtl(input.ttl);
    const priority = assertPriorityIfRequired(input.type, input.priority);
    const domain = await dbPg.getDomainByName(this.env, this.pgUserId!, domainName, this.pgOrgId);
    if (!domain) throw new Error(`Domain not found: ${domainName}`);
    const upserted = await dbPg.upsertDnsRecord(this.env, this.pgUserId!, {
      domainId: domain.id,
      subdomain: input.subdomain ?? "",
      type: input.type,
      value,
      ttl,
      priority,
    });
    const change = await dbPg.insertChangeLog(this.env, this.pgUserId!, {
      domainId: domain.id,
      recordId: upserted.record.id,
      action: upserted.action,
      recordType: input.type,
      oldValue: upserted.oldValue,
      newValue: upserted.record.value,
      source: input.source ?? "user",
    }, this.pgOrgId);
    await this.indexChangeForSearch(change, domainName);
    await this.refreshState();
    return { ok: true, action: upserted.action, record: upserted.record };
  }

  async deleteDnsRecord(input: { domain: string; subdomain?: string; type: DnsRecordType }): Promise<Record<string, unknown>> {
    this.requirePg();
    const domainName = assertValidDomain(input.domain);
    const domain = await dbPg.getDomainByName(this.env, this.pgUserId!, domainName, this.pgOrgId);
    if (!domain) throw new Error(`Domain not found: ${domainName}`);
    const existing = await dbPg.findDnsRecord(this.env, this.pgUserId!, domain.id, input.subdomain ?? "", input.type);
    if (!existing) return { ok: true, deleted: false, message: "No record found." };
    const approved = await this.requestApproval({
      type: "delete_record",
      description: `Delete ${input.type} for ${(input.subdomain || "@")}.${domainName}`,
      details: { ...input, value: existing.value },
    });
    if (!approved) return { ok: true, deleted: false, message: "Deletion rejected." };
    await dbPg.deleteDnsRecordById(this.env, this.pgUserId!, existing.id);
    const change = await dbPg.insertChangeLog(this.env, this.pgUserId!, {
      domainId: domain.id,
      recordId: existing.id,
      action: "deleted",
      recordType: input.type,
      oldValue: existing.value,
      newValue: null,
      source: "user",
    }, this.pgOrgId);
    await this.indexChangeForSearch(change, domainName);
    await this.refreshState();
    return { ok: true, deleted: true };
  }

  async queryDomains(input: {
    query?: string;
    filter?: "all" | "expiring_soon" | "ssl_issues" | "inactive";
    registrar?: string;
  }): Promise<Record<string, unknown>> {
    this.requirePg();
    const domains = await dbPg.queryDomains(this.env, this.pgUserId!, input.query, input.filter, input.registrar, this.pgOrgId);
    return { ok: true, count: domains.length, domains };
  }

  async getDnsRecords(input: { domain: string; recordType?: string }): Promise<Record<string, unknown>> {
    this.requirePg();
    const domainName = assertValidDomain(input.domain);
    const domain = await dbPg.getDomainByName(this.env, this.pgUserId!, domainName, this.pgOrgId);
    if (!domain) throw new Error(`Domain not found: ${domainName}`);
    const records = await dbPg.getDnsRecordsForDomain(this.env, this.pgUserId!, domain.id, input.recordType);
    return { ok: true, domain: domainName, records };
  }

  async getDnsHistoryTool(input: { domain: string; recordType?: string; limit?: number }): Promise<Record<string, unknown>> {
    this.requirePg();
    const domainName = assertValidDomain(input.domain);
    const domain = await dbPg.getDomainByName(this.env, this.pgUserId!, domainName, this.pgOrgId);
    if (!domain) throw new Error(`Domain not found: ${domainName}`);
    const history = await dbPg.getDnsHistory(this.env, this.pgUserId!, domain.id, input.recordType, input.limit ?? 20);
    return { ok: true, history };
  }

  async getAlerts(input: { limit?: number }): Promise<Record<string, unknown>> {
    this.requirePg();
    const alerts = await dbPg.listAlerts(this.env, this.pgUserId!, input.limit ?? 50, this.pgOrgId);
    return { ok: true, alerts };
  }

  async searchHistory(input: { query: string }): Promise<Record<string, unknown>> {
    try {
      const embedding = await withRetry(async () =>
        this.env.AI.run("@cf/baai/bge-base-en-v1.5", { text: [input.query] }) as Promise<{ data: number[][] }>,
      );
      const matches = await withRetry(async () => this.env.VECTORIZE.query(embedding.data[0], { topK: 8, returnMetadata: true }));
      return { ok: true, source: "vectorize", matches: matches.matches ?? [] };
    } catch {
      this.requirePg();
      const fallbackList = await dbPg.recentChanges(this.env, this.pgUserId!, 25, this.pgOrgId);
      const fallback = fallbackList.filter((item) =>
        `${item.record_type ?? ""} ${item.old_value ?? ""} ${item.new_value ?? ""}`.toLowerCase().includes(input.query.toLowerCase()),
      );
      return { ok: true, source: "sql-fallback", matches: fallback };
    }
  }

  async checkDomainHealthTool(input: { domain: string }): Promise<HealthReport> {
    this.requirePg();
    const domainName = assertValidDomain(input.domain);
    const d = await dbPg.getDomainByName(this.env, this.pgUserId!, domainName, this.pgOrgId);
    if (!d) throw new Error(`Domain not found: ${domainName}`);
    const domain = d;
    const records = await dbPg.getDnsRecordsForDomain(this.env, this.pgUserId!, d.id);
    const findings: string[] = [];
    const expiry = domain.expiry_date ? daysUntil(domain.expiry_date) : null;
    const ssl = domain.ssl_expiry_date ? daysUntil(domain.ssl_expiry_date) : null;
    if (expiry !== null && expiry <= 7) findings.push(`Domain expiry critical: ${expiry} days.`);
    else if (expiry !== null && expiry <= 30) findings.push(`Domain expiry warning: ${expiry} days.`);
    if (ssl !== null && ssl <= 7) findings.push(`SSL expiry critical: ${ssl} days.`);
    else if (ssl !== null && ssl <= 30) findings.push(`SSL expiry warning: ${ssl} days.`);
    if (!records.some((r) => r.subdomain === "" && (r.record_type === "A" || r.record_type === "AAAA"))) findings.push("Missing root A/AAAA record.");
    if (!records.some((r) => r.record_type === "MX")) findings.push("Missing MX record.");
    if (!records.some((r) => r.record_type === "TXT" && r.value.includes("v=spf1"))) findings.push("Missing SPF TXT record.");
    return {
      domain: domainName,
      severity: findings.some((f) => f.includes("critical")) ? "critical" : findings.length ? "warning" : "ok",
      findings,
      daysUntilExpiry: expiry,
      daysUntilSslExpiry: ssl,
    };
  }

  async bulkUpdate(input: BulkUpdateInput): Promise<Record<string, unknown>> {
    const approved = await this.requestApproval({
      type: "bulk_update",
      description: `Bulk DNS change: ${input.description}`,
      details: { domains: input.domains ?? "all" },
    });
    if (!approved) return { ok: true, approved: false };
    await this.triggerBulkWorkflow(input);
    return { ok: true, approved: true };
  }

  async requestApproval(action: {
    type: string;
    description: string;
    details: Record<string, unknown>;
  }): Promise<boolean> {
    const pending: PendingAction = {
      id: crypto.randomUUID(),
      action: action.type,
      description: action.description,
      details: action.details,
      createdAt: nowIso(),
    };
    await this.setState({
      ...this.stateData,
      pendingApprovals: [...this.stateData.pendingApprovals, pending],
    });
    return new Promise<boolean>((resolve) => this.approvalCallbacks.set(pending.id, resolve));
  }

  async handleApprovalResponse(approvalId: string, approved: boolean): Promise<{ ok: boolean }> {
    const callback = this.approvalCallbacks.get(approvalId);
    if (callback) {
      callback(approved);
      this.approvalCallbacks.delete(approvalId);
    }
    await this.setState({
      ...this.stateData,
      pendingApprovals: this.stateData.pendingApprovals.filter((x) => x.id !== approvalId),
    });
    return { ok: true };
  }

  async runDailyHealthCheck(): Promise<{ checked: number; alerts: number }> {
    this.requirePg();
    const domains = (await dbPg.listDomains(this.env, this.pgUserId!, this.pgOrgId)).filter((d) => d.status === "active");
    let alerts = 0;
    for (const d of domains) {
      if (!d.expiry_date || !isWithinDays(d.expiry_date, 30)) continue;
      const days = daysUntil(d.expiry_date);
      const level = days <= 7 ? "critical_expiry" : "upcoming_expiry";
      const message = await this.generateAlert(d.domain, days, level);
      const alert = await dbPg.insertScheduledAlert(this.env, this.pgUserId!, {
        domainId: d.id,
        alertType: level,
        scheduledFor: nowIso(),
        message,
      }, this.pgOrgId);
      await this.dispatchAlert(alert);
      alerts++;
    }
    await this.setState({ ...this.stateData, lastHealthCheck: nowIso() });
    await this.refreshState();
    return { checked: domains.length, alerts };
  }

  async generateWeeklyDigest(): Promise<Record<string, unknown>> {
    this.requirePg();
    const domains = await dbPg.listDomains(this.env, this.pgUserId!, this.pgOrgId);
    const recentChangesList = await dbPg.recentChanges(this.env, this.pgUserId!, 10, this.pgOrgId);
    return {
      totalDomains: domains.length,
      expiringSoon: domains.filter((d) => d.expiry_date && isWithinDays(d.expiry_date, 30)).length,
      recentChanges: recentChangesList,
    };
  }

  async checkDnsPropagation(): Promise<{ checked: number }> {
    this.requirePg();
    const list = await dbPg.recentChanges(this.env, this.pgUserId!, 50, this.pgOrgId);
    return { checked: list.length };
  }

  async sendRenewalReminder(payload: { domain: string; daysBefore: number }): Promise<{ ok: boolean }> {
    this.requirePg();
    const domain = await dbPg.getDomainByName(this.env, this.pgUserId!, payload.domain, this.pgOrgId);
    if (!domain) return { ok: false };
    const alert = await dbPg.insertScheduledAlert(this.env, this.pgUserId!, {
      domainId: domain.id,
      alertType: "expiry_reminder",
      scheduledFor: nowIso(),
      message: `${payload.domain} expires in ${payload.daysBefore} days.`,
    }, this.pgOrgId);
    await this.dispatchAlert(alert);
    return { ok: true };
  }

  async scheduleExpiryReminders(domain: string, expiryDateIso: string): Promise<void> {
    const date = new Date(expiryDateIso);
    for (const daysBefore of [30, 14, 7, 1]) {
      const when = new Date(date.getTime() - daysBefore * 86400000);
      if (when > new Date()) {
        await this.state.storage.put(`scheduled_reminder:${domain}:${daysBefore}`, when.toISOString());
      }
    }
  }

  async generateAlert(domain: string, days: number, level: string): Promise<string> {
    try {
      const workersai = createWorkersAI({ binding: this.env.AI });
      return await withRetry(async () => {
        const result = streamText({
          model: workersai("@cf/meta/llama-3.3-70b-instruct-fp8-fast" as never),
          system: "Write short actionable domain alert messages.",
          prompt: `${domain} has ${level} status and expires in ${days} days.`,
        });
        return result.text;
      });
    } catch {
      return `${domain} expires in ${days} days.`;
    }
  }

  async dispatchAlert(alert: dbPg.ScheduledAlertRecord): Promise<void> {
    this.requirePg();
    await dbPg.markAlertSent(this.env, this.pgUserId!, alert.id);
  }

  async indexChangeForSearch(change: ChangeLogEntry, domain: string): Promise<void> {
    try {
      const description = `${change.action} ${change.record_type ?? ""} for ${domain} from ${change.old_value ?? "n/a"} to ${change.new_value ?? "n/a"}`;
      const embedding = await withRetry(async () =>
        this.env.AI.run("@cf/baai/bge-base-en-v1.5", { text: [description] }) as Promise<{ data: number[][] }>,
      );
      await withRetry(async () => this.env.VECTORIZE.upsert([
        {
          id: change.id,
          values: embedding.data[0],
          metadata: {
            domain,
            record_type: change.record_type ?? "",
            action: change.action,
            changed_at: change.changed_at,
            description,
          },
        },
      ]));
    } catch {
      // Best effort indexing.
    }
  }

  private async triggerDomainOnboardingWorkflow(input: DomainOnboardingInput): Promise<void> {
    try {
      await this.env.DOMAIN_ONBOARDING_WORKFLOW.start(input);
    } catch {
      // Do not block main request path.
    }
  }

  private async triggerBulkWorkflow(input: BulkUpdateInput): Promise<void> {
    await this.env.BULK_DNS_UPDATE_WORKFLOW.start(input);
  }
}
