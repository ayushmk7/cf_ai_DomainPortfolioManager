import { streamText } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import {
  countDomains,
  countExpiringSoon,
  deleteDnsRecordById,
  ensureTablesExist,
  findDnsRecord,
  getDnsHistory,
  getDnsRecordsForDomain,
  getDomainByName,
  insertChangeLog,
  insertDomain,
  insertScheduledAlert,
  listDomains,
  markAlertSent,
  queryDomains as queryDomainsDb,
  recentChanges,
  upsertDnsRecord,
  type ScheduledAlertRecord,
  type SqlExecutor,
} from "./db";
import { createToolset } from "./tools";
import { DOMAIN_MANAGER_SYSTEM_PROMPT } from "./prompts";
import type {
  BulkUpdateInput,
  ChangeLogEntry,
  DomainOnboardingInput,
  DomainPilotState,
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

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
  ) {
    this.tools = createToolset(this);
  }

  private get sql(): SqlExecutor {
    return this.state.storage.sql as unknown as SqlExecutor;
  }

  private async loadState(): Promise<void> {
    if (this.initialized) return;
    ensureTablesExist(this.sql);
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

  async refreshState(): Promise<void> {
    await this.setState({
      ...this.stateData,
      domainCount: countDomains(this.sql),
      domainsExpiringSoon: countExpiringSoon(this.sql, 30),
      recentChanges: recentChanges(this.sql, 10),
    });
  }

  async addDomain(input: DomainOnboardingInput): Promise<Record<string, unknown>> {
    const domain = assertValidDomain(input.domain);
    const expiryDate = input.expiryDate ? toIsoDate(input.expiryDate) : undefined;
    const existing = getDomainByName(this.sql, domain);
    if (existing) return { ok: true, created: false, domain: existing };

    const created = insertDomain(this.sql, {
      domain,
      registrar: input.registrar,
      expiryDate,
      notes: input.notes,
    });

    if (expiryDate) await this.scheduleExpiryReminders(domain, expiryDate);
    await this.triggerDomainOnboardingWorkflow({ ...input, domain, expiryDate });
    await this.refreshState();
    return { ok: true, created: true, domain: created };
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
    const domainName = assertValidDomain(input.domain);
    const domain = getDomainByName(this.sql, domainName);
    if (!domain) throw new Error(`Domain not found: ${domainName}`);
    const value = assertValidRecordValue(input.type, input.value);
    const ttl = assertValidTtl(input.ttl);
    const priority = assertPriorityIfRequired(input.type, input.priority);
    const upserted = upsertDnsRecord(this.sql, {
      domainId: domain.id,
      subdomain: input.subdomain ?? "",
      type: input.type,
      value,
      ttl,
      priority,
    });
    const change = insertChangeLog(this.sql, {
      domainId: domain.id,
      recordId: upserted.record.id,
      action: upserted.action,
      recordType: input.type,
      oldValue: upserted.oldValue,
      newValue: upserted.record.value,
      source: input.source ?? "user",
    });
    await this.indexChangeForSearch(change, domainName);
    await this.refreshState();
    return { ok: true, action: upserted.action, record: upserted.record };
  }

  async deleteDnsRecord(input: { domain: string; subdomain?: string; type: DnsRecordType }): Promise<Record<string, unknown>> {
    const domainName = assertValidDomain(input.domain);
    const domain = getDomainByName(this.sql, domainName);
    if (!domain) throw new Error(`Domain not found: ${domainName}`);
    const existing = findDnsRecord(this.sql, domain.id, input.subdomain ?? "", input.type);
    if (!existing) return { ok: true, deleted: false, message: "No record found." };

    const approved = await this.requestApproval({
      type: "delete_record",
      description: `Delete ${input.type} for ${(input.subdomain || "@")}.${domainName}`,
      details: { ...input, value: existing.value },
    });
    if (!approved) return { ok: true, deleted: false, message: "Deletion rejected." };

    deleteDnsRecordById(this.sql, existing.id);
    const change = insertChangeLog(this.sql, {
      domainId: domain.id,
      recordId: existing.id,
      action: "deleted",
      recordType: input.type,
      oldValue: existing.value,
      newValue: null,
      source: "user",
    });
    await this.indexChangeForSearch(change, domainName);
    await this.refreshState();
    return { ok: true, deleted: true };
  }

  async queryDomains(input: {
    query?: string;
    filter?: "all" | "expiring_soon" | "ssl_issues" | "inactive";
    registrar?: string;
  }): Promise<Record<string, unknown>> {
    const domains = queryDomainsDb(this.sql, input.query, input.filter, input.registrar);
    return { ok: true, count: domains.length, domains };
  }

  async getDnsRecords(input: { domain: string; recordType?: string }): Promise<Record<string, unknown>> {
    const domainName = assertValidDomain(input.domain);
    const domain = getDomainByName(this.sql, domainName);
    if (!domain) throw new Error(`Domain not found: ${domainName}`);
    return { ok: true, domain: domainName, records: getDnsRecordsForDomain(this.sql, domain.id, input.recordType) };
  }

  async getDnsHistoryTool(input: { domain: string; recordType?: string; limit?: number }): Promise<Record<string, unknown>> {
    const domainName = assertValidDomain(input.domain);
    const domain = getDomainByName(this.sql, domainName);
    if (!domain) throw new Error(`Domain not found: ${domainName}`);
    return { ok: true, history: getDnsHistory(this.sql, domain.id, input.recordType, input.limit ?? 20) };
  }

  async searchHistory(input: { query: string }): Promise<Record<string, unknown>> {
    try {
      const embedding = await withRetry(async () =>
        this.env.AI.run("@cf/baai/bge-base-en-v1.5", { text: [input.query] }) as Promise<{ data: number[][] }>,
      );
      const matches = await withRetry(async () => this.env.VECTORIZE.query(embedding.data[0], { topK: 8, returnMetadata: true }));
      return { ok: true, source: "vectorize", matches: matches.matches ?? [] };
    } catch {
      const fallback = recentChanges(this.sql, 25).filter((item) =>
        `${item.record_type ?? ""} ${item.old_value ?? ""} ${item.new_value ?? ""}`.toLowerCase().includes(input.query.toLowerCase()),
      );
      return { ok: true, source: "sql-fallback", matches: fallback };
    }
  }

  async checkDomainHealthTool(input: { domain: string }): Promise<HealthReport> {
    const domainName = assertValidDomain(input.domain);
    const domain = getDomainByName(this.sql, domainName);
    if (!domain) throw new Error(`Domain not found: ${domainName}`);
    const records = getDnsRecordsForDomain(this.sql, domain.id);
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
    const domains = listDomains(this.sql).filter((d) => d.status === "active");
    let alerts = 0;
    for (const d of domains) {
      if (!d.expiry_date || !isWithinDays(d.expiry_date, 30)) continue;
      const days = daysUntil(d.expiry_date);
      const level = days <= 7 ? "critical_expiry" : "upcoming_expiry";
      const message = await this.generateAlert(d.domain, days, level);
      const alert = insertScheduledAlert(this.sql, {
        domainId: d.id,
        alertType: level,
        scheduledFor: nowIso(),
        message,
      });
      await this.dispatchAlert(alert);
      alerts++;
    }
    await this.setState({ ...this.stateData, lastHealthCheck: nowIso() });
    await this.refreshState();
    return { checked: domains.length, alerts };
  }

  async generateWeeklyDigest(): Promise<Record<string, unknown>> {
    const domains = listDomains(this.sql);
    return {
      totalDomains: domains.length,
      expiringSoon: domains.filter((d) => d.expiry_date && isWithinDays(d.expiry_date, 30)).length,
      recentChanges: recentChanges(this.sql, 10),
    };
  }

  async checkDnsPropagation(): Promise<{ checked: number }> {
    return { checked: recentChanges(this.sql, 50).length };
  }

  async sendRenewalReminder(payload: { domain: string; daysBefore: number }): Promise<{ ok: boolean }> {
    const domain = getDomainByName(this.sql, payload.domain);
    if (!domain) return { ok: false };
    const alert = insertScheduledAlert(this.sql, {
      domainId: domain.id,
      alertType: "expiry_reminder",
      scheduledFor: nowIso(),
      message: `${payload.domain} expires in ${payload.daysBefore} days.`,
    });
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

  async dispatchAlert(alert: ScheduledAlertRecord): Promise<void> {
    markAlertSent(this.sql, alert.id);
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
