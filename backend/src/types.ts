export type DomainStatus = "active" | "parked" | "for_sale" | "expired";
export type DnsRecordType = "A" | "AAAA" | "CNAME" | "MX" | "TXT" | "NS" | "SRV" | "CAA";
export type ChangeAction = "created" | "updated" | "deleted";
export type ChangeSource = "user" | "bulk_update" | "import";
export type HealthSeverity = "ok" | "warning" | "critical";

export interface DomainRecord {
  id: string;
  domain: string;
  registrar: string | null;
  expiry_date: string | null;
  ssl_expiry_date: string | null;
  status: DomainStatus;
  created_at: string;
  updated_at: string;
  notes: string | null;
}

export interface DnsRecord {
  id: string;
  domain_id: string;
  subdomain: string;
  record_type: DnsRecordType;
  value: string;
  ttl: number;
  priority: number | null;
  created_at: string;
  updated_at: string;
}

export interface ChangeLogEntry {
  id: string;
  domain_id: string;
  record_id: string | null;
  action: ChangeAction;
  record_type: DnsRecordType | null;
  old_value: string | null;
  new_value: string | null;
  changed_at: string;
  change_source: ChangeSource;
}

export interface PendingAction {
  id: string;
  action: string;
  description: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface DomainPilotState {
  domainCount: number;
  domainsExpiringSoon: number;
  lastHealthCheck: string | null;
  pendingApprovals: PendingAction[];
  recentChanges: ChangeLogEntry[];
  alertsEnabled: boolean;
}

export interface HealthReport {
  domain: string;
  severity: HealthSeverity;
  findings: string[];
  daysUntilExpiry: number | null;
  daysUntilSslExpiry: number | null;
}

export interface DomainOnboardingInput {
  domain: string;
  registrar?: string;
  expiryDate?: string;
  notes?: string;
  source?: ChangeSource;
}

export interface BulkUpdateInput {
  description: string;
  domains?: string[];
}

export interface WorkflowHandle<TInput = unknown> {
  start: (input: TInput) => Promise<unknown>;
}

export interface Env {
  AI: Ai;
  VECTORIZE: VectorizeIndex;
  DOMAIN_PILOT_AGENT: DurableObjectNamespace;
  DOMAIN_ONBOARDING_WORKFLOW: WorkflowHandle<DomainOnboardingInput>;
  BULK_DNS_UPDATE_WORKFLOW: WorkflowHandle<BulkUpdateInput>;
  OPENAI_API_KEY?: string;
  FIREBASE_PROJECT_ID?: string;
  /** Firebase Web API Key (from Project settings) — required for per-user auth; used to verify idToken. */
  FIREBASE_WEB_API_KEY?: string;
  DATABASE_URL?: string;
  HYPERDRIVE?: Hyperdrive;
  /** 32-byte hex (64 chars) or base64 for AES-256-GCM; encrypts provider credentials and API keys at rest. */
  ENCRYPTION_KEY?: string;
  /** WhoisXMLAPI key for WHOIS lookups (whoisserver/WhoisService). */
  WHOIS_API_KEY?: string;
}
