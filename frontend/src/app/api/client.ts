/// <reference types="vite/client" />
/**
 * API base URL: in dev we use /api (Vite proxy forwards to backend); in prod we use VITE_API_URL.
 */
function getBaseUrl(): string {
  if (import.meta.env.DEV) {
    return "/api";
  }
  return (import.meta.env.VITE_API_URL as string) || "";
}

const defaultUserId = "anonymous";

export interface HealthResponse {
  ok: boolean;
  service?: string;
}

export interface PendingAction {
  id: string;
  action: string;
  description: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface ChangeLogEntry {
  id: string;
  domain_id: string;
  record_id: string | null;
  action: string;
  record_type: string | null;
  old_value: string | null;
  new_value: string | null;
  changed_at: string;
  change_source: string;
}

export interface DomainPilotState {
  domainCount: number;
  domainsExpiringSoon: number;
  lastHealthCheck: string | null;
  pendingApprovals: PendingAction[];
  recentChanges: ChangeLogEntry[];
  alertsEnabled: boolean;
}

export interface AgentStateResponse {
  ok: boolean;
  state: DomainPilotState;
}

export interface ChatResponse {
  ok: boolean;
  text?: string;
  state?: DomainPilotState;
  error?: string;
  kind?: string;
}

export interface ToolResponse {
  ok: boolean;
  result?: unknown;
  state?: DomainPilotState;
  error?: string;
  kind?: string;
}

export type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const base = getBaseUrl().replace(/\/$/, "");
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const data = (await res.json().catch(() => ({}))) as T & { ok?: boolean; error?: string };
  if (!res.ok) {
    const err = new Error((data as { error?: string }).error ?? res.statusText);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  return data as T;
}

export function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>("/health");
}

/** Pass idToken when user is signed in; optional orgId for multi-tenant scope. */
function authHeaders(
  idToken: string | null | undefined,
  orgId?: string | null
): Record<string, string> {
  const headers: Record<string, string> = {};
  if (idToken) headers.Authorization = `Bearer ${idToken}`;
  if (orgId) headers["X-Org-Id"] = orgId;
  return headers;
}

function agentHeaders(
  idToken: string | null | undefined,
  orgId?: string | null
): Record<string, string> {
  return authHeaders(idToken, orgId);
}

export interface DomainRecord {
  id: string;
  domain: string;
  registrar: string | null;
  expiry_date: string | null;
  ssl_expiry_date: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  notes: string | null;
}

export interface DnsRecordApi {
  id: string;
  domain_id: string;
  subdomain: string;
  record_type: string;
  value: string;
  ttl: number;
  priority: number | null;
  created_at: string;
  updated_at: string;
}

export interface OrgRecord {
  id: string;
  name: string;
  slug: string;
  owner_user_id: string;
  plan: string;
  max_seats: number;
  created_at: string;
}

export function getOrgs(idToken: string | null | undefined): Promise<{ orgs: OrgRecord[] }> {
  return request<{ orgs: OrgRecord[] }>("/orgs", { headers: authHeaders(idToken) });
}

export interface ClientRecord {
  id: string;
  org_id: string;
  name: string;
  contact_email: string | null;
  contact_name: string | null;
  notes: string | null;
  color: string | null;
  created_at: string;
}

export function getClients(
  idToken: string | null | undefined,
  orgId?: string | null
): Promise<{ clients: ClientRecord[] }> {
  return request<{ clients: ClientRecord[] }>("/clients", {
    headers: authHeaders(idToken, orgId),
  });
}

export function getClient(
  clientId: string,
  idToken: string | null | undefined,
  orgId?: string | null
): Promise<{ client: ClientRecord }> {
  return request<{ client: ClientRecord }>(`/clients/${clientId}`, {
    headers: authHeaders(idToken, orgId),
  });
}

export interface InvitationRecord {
  id: string;
  org_id: string;
  email: string;
  role: string;
  token: string;
  invited_by: string;
  created_at: string;
  expires_at: string;
}

export function getInvitations(
  idToken: string | null | undefined,
  orgId?: string | null
): Promise<{ invitations: InvitationRecord[] }> {
  return request<{ invitations: InvitationRecord[] }>("/invitations", {
    headers: authHeaders(idToken, orgId),
  });
}

export function createInvitation(
  idToken: string | null | undefined,
  orgId: string | null | undefined,
  email: string,
  role: string
): Promise<{ invitation: { id: string; email: string; role: string; expires_at: string; invite_link: string } }> {
  return request("/invitations", {
    method: "POST",
    headers: authHeaders(idToken, orgId),
    body: JSON.stringify({ email, role }),
  });
}

export function acceptInvitationApi(
  idToken: string | null | undefined,
  token: string
): Promise<{ ok: boolean; orgId?: string }> {
  return request("/invitations/accept", {
    method: "POST",
    headers: authHeaders(idToken),
    body: JSON.stringify({ token }),
  });
}

export function revokeInvitation(
  idToken: string | null | undefined,
  orgId: string | null | undefined,
  invitationId: string
): Promise<{ ok: boolean }> {
  return request(`/invitations/${invitationId}`, {
    method: "DELETE",
    headers: authHeaders(idToken, orgId),
  });
}

export interface ProviderConnection {
  id: string;
  provider_type: string;
  display_name: string | null;
  status: string;
  last_sync_at: string | null;
  last_error: string | null;
  created_at: string;
}

export function getProviders(
  idToken: string | null | undefined,
  orgId?: string | null
): Promise<{ providers: ProviderConnection[] }> {
  return request("/providers", { headers: authHeaders(idToken, orgId) });
}

export function connectProvider(
  idToken: string | null | undefined,
  orgId: string | null | undefined,
  providerType: string,
  credentials: { apiToken?: string },
  displayName?: string
): Promise<{ provider: ProviderConnection }> {
  return request("/providers", {
    method: "POST",
    headers: authHeaders(idToken, orgId),
    body: JSON.stringify({ provider_type: providerType, display_name: displayName, credentials }),
  });
}

export function testProvider(
  idToken: string | null | undefined,
  orgId: string | null | undefined,
  providerId: string
): Promise<{ ok: boolean }> {
  return request(`/providers/${providerId}/test`, {
    method: "POST",
    headers: authHeaders(idToken, orgId),
  });
}

export function syncProvider(
  idToken: string | null | undefined,
  orgId: string | null | undefined,
  providerId: string
): Promise<{ ok: boolean; summary?: { zones_fetched: number } }> {
  return request(`/providers/${providerId}/sync`, {
    method: "POST",
    headers: authHeaders(idToken, orgId),
  });
}

export function disconnectProvider(
  idToken: string | null | undefined,
  orgId: string | null | undefined,
  providerId: string
): Promise<{ ok: boolean }> {
  return request(`/providers/${providerId}`, {
    method: "DELETE",
    headers: authHeaders(idToken, orgId),
  });
}

export function getDomains(
  idToken: string | null | undefined,
  limit?: number,
  orgId?: string | null,
  clientId?: string | null
): Promise<{ domains: DomainRecord[] }> {
  const params = new URLSearchParams();
  if (limit != null) params.set("limit", String(limit));
  if (clientId) params.set("clientId", clientId);
  const q = params.toString() ? `?${params.toString()}` : "";
  return request<{ domains: DomainRecord[] }>(`/domains${q}`, {
    headers: authHeaders(idToken, orgId),
  });
}

export function getDomain(
  domainId: string,
  idToken: string | null | undefined,
  orgId?: string | null
): Promise<{ domain: DomainRecord }> {
  return request<{ domain: DomainRecord }>(`/domains/${domainId}`, {
    headers: authHeaders(idToken, orgId),
  });
}

export function updateDomain(
  domainId: string,
  body: { registrar?: string; expiry_date?: string; notes?: string; status?: string; client_id?: string },
  idToken: string | null | undefined,
  orgId?: string | null
): Promise<{ domain: DomainRecord }> {
  return request<{ domain: DomainRecord }>(`/domains/${domainId}`, {
    method: "PATCH",
    headers: authHeaders(idToken, orgId),
    body: JSON.stringify(body),
  });
}

export function getDomainRecords(
  domainId: string,
  idToken: string | null | undefined,
  recordType?: string,
  orgId?: string | null
): Promise<{ domain: string; records: DnsRecordApi[] }> {
  const q = recordType ? `?recordType=${encodeURIComponent(recordType)}` : "";
  return request<{ domain: string; records: DnsRecordApi[] }>(`/domains/${domainId}/records${q}`, {
    headers: authHeaders(idToken, orgId),
  });
}

export function getHistory(
  idToken: string | null | undefined,
  limit?: number,
  orgId?: string | null
): Promise<{ history: ChangeLogEntry[] }> {
  const q = limit != null ? `?limit=${limit}` : "";
  return request<{ history: ChangeLogEntry[] }>(`/history${q}`, {
    headers: authHeaders(idToken, orgId),
  });
}

export function getAlerts(
  idToken: string | null | undefined,
  limit?: number,
  orgId?: string | null
): Promise<{
  alerts: { id: string; domain_id: string; alert_type: string; scheduled_for: string; sent: number; message: string | null }[];
}> {
  const q = limit != null ? `?limit=${limit}` : "";
  return request<{ alerts: { id: string; domain_id: string; alert_type: string; scheduled_for: string; sent: number; message: string | null }[] }>(
    `/alerts${q}`,
    { headers: authHeaders(idToken, orgId) }
  );
}

export function getAgentState(
  idToken?: string | null,
  orgId?: string | null
): Promise<AgentStateResponse> {
  const name = idToken ? "me" : defaultUserId;
  return request<AgentStateResponse>(`/agent/state?name=${encodeURIComponent(name)}`, {
    headers: agentHeaders(idToken, orgId),
  });
}

export function postChat(
  messages: ChatMessage[],
  idToken?: string | null,
  orgId?: string | null
): Promise<ChatResponse> {
  const name = idToken ? "me" : defaultUserId;
  return request<ChatResponse>(`/agent?name=${encodeURIComponent(name)}`, {
    method: "POST",
    body: JSON.stringify({ action: "chat", messages }),
    headers: agentHeaders(idToken, orgId),
  });
}

export function postTool(
  toolName: string,
  params: Record<string, unknown>,
  idToken?: string | null,
  orgId?: string | null
): Promise<ToolResponse> {
  const name = idToken ? "me" : defaultUserId;
  return request<ToolResponse>(`/agent?name=${encodeURIComponent(name)}`, {
    method: "POST",
    body: JSON.stringify({ action: "tool", toolName, params }),
    headers: agentHeaders(idToken, orgId),
  });
}
