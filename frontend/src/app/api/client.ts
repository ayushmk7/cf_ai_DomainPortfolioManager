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

/** Pass idToken when user is signed in so the backend uses their per-user DB (Durable Object). */
function agentHeaders(idToken: string | null | undefined): Record<string, string> {
  const headers: Record<string, string> = {};
  if (idToken) headers.Authorization = `Bearer ${idToken}`;
  return headers;
}

export function getAgentState(idToken?: string | null): Promise<AgentStateResponse> {
  const name = idToken ? "me" : defaultUserId;
  return request<AgentStateResponse>(`/agent/state?name=${encodeURIComponent(name)}`, {
    headers: agentHeaders(idToken),
  });
}

export function postChat(
  messages: ChatMessage[],
  idToken?: string | null
): Promise<ChatResponse> {
  const name = idToken ? "me" : defaultUserId;
  return request<ChatResponse>(`/agent?name=${encodeURIComponent(name)}`, {
    method: "POST",
    body: JSON.stringify({ action: "chat", messages }),
    headers: agentHeaders(idToken),
  });
}

export function postTool(
  toolName: string,
  params: Record<string, unknown>,
  idToken?: string | null
): Promise<ToolResponse> {
  const name = idToken ? "me" : defaultUserId;
  return request<ToolResponse>(`/agent?name=${encodeURIComponent(name)}`, {
    method: "POST",
    body: JSON.stringify({ action: "tool", toolName, params }),
    headers: agentHeaders(idToken),
  });
}

// --- Stripe / Billing ---

export interface SubscriptionInfo {
  plan: string;
  status: string;
  stripeCustomerId: string | null;
  currentPeriodEnd: string | null;
}

export interface SubscriptionResponse {
  subscription: SubscriptionInfo | null;
}

export function getSubscription(idToken: string | null): Promise<SubscriptionResponse> {
  const headers: Record<string, string> = {};
  if (idToken) headers.Authorization = `Bearer ${idToken}`;
  return request<SubscriptionResponse>("/subscription", { headers });
}

export interface CreateCheckoutSessionResponse {
  url: string;
}

export function createCheckoutSession(params: {
  userId: string;
  customerEmail?: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<CreateCheckoutSessionResponse> {
  return request<CreateCheckoutSessionResponse>("/create-checkout-session", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export interface CreatePortalSessionResponse {
  url: string;
}

export function createPortalSession(stripeCustomerId: string, returnUrl: string): Promise<CreatePortalSessionResponse> {
  return request<CreatePortalSessionResponse>("/create-portal-session", {
    method: "POST",
    body: JSON.stringify({ stripeCustomerId, returnUrl }),
  });
}
