# DomainPilot — Master TODO

**Target audience: agencies and teams managing 20-500+ domains across multiple
registrars and DNS providers for themselves and their clients.**

**Core pitch: "Stop juggling five registrar dashboards and a spreadsheet.
Connect all your providers, get one view, and let AI catch the things you miss."**

This is NOT a toy for solo devs with 3 domains on Cloudflare. This is a
professional tool for people whose job involves managing DNS and domains for
multiple clients/projects, where a missed renewal or a stale MX record costs
real money and real reputation.

---

## 0. Critical Foundation — Postgres as the Source of Truth

Right now domain data lives in Durable Object SQLite (per-user, ephemeral,
lost on redeploy). Postgres (Neon) is only used for `users` and `subscriptions`.
Nothing else works until all data lives in a real, persistent, shared database.

- [ ] Replace the Neon HTTP hack in `pg.ts` with the **@neondatabase/serverless** driver (WebSocket-based, works on Cloudflare Workers natively)
- [ ] Migrate ALL domain data tables to Postgres:
  - `domains` — proper Postgres types, FK to `users`, scoped per account
  - `dns_records` — FK to `domains`
  - `dns_change_history` — FK to `domains`, immutable audit log
  - `scheduled_alerts` — FK to `domains`
- [ ] Add `organization_id` column to `domains` (not just `user_id` — agencies have teams, not individuals)
- [ ] Write proper versioned migration files (`migrations/001_initial.sql`, `002_orgs.sql`, etc.) and a migration runner that tracks which migrations have been applied
- [ ] Add connection pooling config — Neon pooler endpoint is already in the DATABASE_URL, ensure we're using it correctly with connection limits appropriate for a Cloudflare Worker (stateless, many concurrent requests, short-lived connections)
- [ ] Remove Durable Object SQLite dependency for domain data entirely — keep DO only for real-time WebSocket agent sessions if needed later
- [ ] Add `DATABASE_URL` as a Wrangler secret for production (never in wrangler.jsonc, never in source control)
- [ ] Update every agent method (`addDomain`, `queryDomains`, `addDnsRecord`, `getDnsRecords`, `getDnsHistory`, `searchHistory`, `checkDomainHealthTool`, `bulkUpdate`, `getAlerts`, `runDailyHealthCheck`, `generateWeeklyDigest`) to read/write from Postgres instead of `this.state.storage.sql`
- [ ] Add a health-check query that verifies Postgres connectivity on `/health`
- [ ] Implement database-level Row Level Security (RLS) or application-level scoping so users can NEVER access another organization's data — this is non-negotiable for an agency tool

---

## 1. Organizations, Teams & RBAC

Agencies aren't solo users. An agency has an account, multiple team members,
and manages domains for multiple clients. This needs to be first-class.

### Organization Model
- [ ] `organizations` table:
  ```sql
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,        -- for URLs: /org/acme-agency
  owner_user_id UUID NOT NULL REFERENCES users(id),
  plan TEXT DEFAULT 'free',
  stripe_customer_id TEXT,
  max_seats INTEGER DEFAULT 1,
  max_domains INTEGER DEFAULT 5,
  max_providers INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
  ```
- [ ] `org_memberships` table:
  ```sql
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  invited_by UUID REFERENCES users(id),
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  UNIQUE(org_id, user_id)
  ```
- [ ] All domain data is scoped to `org_id`, not `user_id` — a domain belongs to an org, not a person
- [ ] When a user signs up, auto-create a personal org (org with 1 seat) so the data model is consistent
- [ ] Org switcher in the frontend sidebar — users who belong to multiple orgs (e.g., freelancer working with 3 agencies) can switch between them

### Role-Based Access Control
- [ ] **Owner**: full access, billing, delete org, manage members
- [ ] **Admin**: manage domains, DNS, providers, approve changes, invite members — cannot delete org or change billing
- [ ] **Member**: add/edit domains and DNS, propose destructive changes (must be approved by Admin/Owner), cannot manage providers or members
- [ ] **Viewer**: read-only access to everything — for clients who want to see their domain status without being able to break anything
- [ ] Enforce RBAC in every backend endpoint — check role before executing any mutation
- [ ] Frontend: hide/disable UI elements based on role (e.g., Viewer sees no edit buttons, Member sees "Request Approval" instead of "Delete")

### Client Management (Agency-Specific)
- [ ] `clients` table:
  ```sql
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,              -- "Acme Corp", "Bob's Pizza"
  contact_email TEXT,
  contact_name TEXT,
  notes TEXT,
  color TEXT,                      -- for visual grouping in UI
  created_at TIMESTAMPTZ DEFAULT NOW()
  ```
- [ ] Domains can be assigned to a client: `domains.client_id FK → clients.id`
- [ ] Client dashboard: "Show me all domains for Acme Corp" — one view of everything you manage for that client
- [ ] Client-scoped reports: generate a PDF/email report for a specific client ("Here's the health status of all 12 domains we manage for you")
- [ ] Optional: invite clients as Viewers so they can see their own domains' status without seeing other clients' data (client-scoped Viewer role)

### Invitations & Onboarding
- [ ] Email-based team invitations: Owner/Admin enters an email, we send an invite link
- [ ] Invite link flow: click link → sign up / sign in → auto-join the org with the assigned role
- [ ] Pending invitations management page: see sent invites, resend, revoke
- [ ] Org settings page: manage members, roles, remove members

---

## 2. Make the AI Actually Agentic (Tool-Calling)

The chat currently calls the LLM without passing tools — it's a text-in,
text-out chatbot that can't actually DO anything. For an agency tool, the AI
needs to be a real co-pilot that executes tasks.

### Core Tool-Calling Loop
- [ ] Wire up **function calling** in `onChatMessage`:
  - Pass the full toolset as OpenAI-format function definitions to the LLM
  - Parse `tool_calls` from the model response
  - Execute the called tool with the parsed arguments
  - Feed the tool result back to the model as a `tool` role message
  - Loop until the model produces a final text response (no more tool calls)
  - Cap at 10 tool-call iterations to prevent infinite loops
- [ ] Works with both OpenAI (`gpt-4o-mini` / `gpt-4o`) and Workers AI (Llama 3.3 tool calling)
- [ ] Handle tool execution errors gracefully — feed the error back to the model so it can explain what went wrong or try a different approach

### AI Database Access
- [ ] Add a `queryDatabase` tool that lets the AI run **read-only SQL** against the org's scoped data:
  - Automatically prepends `WHERE org_id = $current_org` to prevent cross-org data leakage
  - Enforces read-only: rejects any query containing INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE
  - Row limit of 100 to prevent massive result sets
  - The AI can use this to answer arbitrary questions:
    - "How many domains do we manage for Acme Corp?"
    - "Which domains expire this month?"
    - "Show me all MX records pointing to Google across our entire portfolio"
    - "What DNS changes were made last Friday?"
    - "List all domains without a DMARC record"
- [ ] Add a `getUserProfile` tool: returns current user's name, email, role in the org, org name, org plan, domain count, member count
- [ ] Add a `getOrgSummary` tool: returns org stats — total domains, domains per client, domains per provider, expiring soon count, security score
- [ ] Add a `getSubscriptionStatus` tool: returns plan, limits, usage — so the AI can explain why something is gated

### Conversation Persistence
- [ ] `chat_conversations` table:
  ```sql
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id),
  user_id UUID NOT NULL REFERENCES users(id),
  title TEXT,                      -- auto-generated from first message or AI summary
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
  ```
- [ ] `chat_messages` table:
  ```sql
  id UUID PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES chat_conversations(id),
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content TEXT,
  tool_name TEXT,
  tool_call_id TEXT,
  tool_params JSONB,
  tool_result JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
  ```
- [ ] Load last N messages as context when continuing a conversation
- [ ] Conversation list in the chat sidebar: switch between past conversations
- [ ] Auto-title conversations using the AI after the first exchange
- [ ] Conversation scoped to org — all team members can see the org's chat history (useful for agencies: "what did Jake configure for Acme yesterday?")

### Streaming Responses
- [ ] Implement Server-Sent Events (SSE) endpoint for chat responses
- [ ] Stream tokens as they arrive from the LLM
- [ ] Stream tool-call events so the frontend can show "Querying domains..." / "Checking DNS records..." in real-time
- [ ] Frontend: render tokens incrementally, show tool activity inline with spinners

### AI Context & Intelligence
- [ ] **Context-aware system prompt**: dynamically inject into the system prompt:
  - Org name, plan, number of domains, number of team members
  - Connected providers
  - Recent activity summary
  - Current user's name and role
  - Today's date (for expiry calculations)
- [ ] **Confirmation before mutations**: the AI must ALWAYS describe what it's about to change and ask "Proceed?" before executing any create/update/delete operation
- [ ] **Error recovery**: if a tool fails, the AI explains the error in plain English and suggests a fix
- [ ] **Proactive suggestions**: after answering a query, suggest related actions:
  - "I see acme.com expires in 12 days — want me to set up a renewal reminder?"
  - "This domain has no DMARC record — want me to add one?"
  - "You have 3 domains with stale MX records pointing to a deprecated Google endpoint — want me to update them?"
- [ ] **Natural language bulk operations**: "Update TTL to 300 for all A records for Acme Corp's domains" → AI generates a plan, shows it as a table, asks for approval, executes each change

---

## 3. Connect to Real DNS Providers

Currently adding a DNS record writes to a local DB — it doesn't create a real
record anywhere. For agencies managing real client infrastructure, changes need
to actually propagate. This is what makes the app a real tool vs. a toy.

### Provider Abstraction Layer (Build First)
- [ ] Define a `DnsProvider` interface:
  ```typescript
  interface DnsProvider {
    id: string;
    name: string;  // "Cloudflare", "GoDaddy", etc.
    
    // Connection
    testConnection(): Promise<{ ok: boolean; error?: string }>;
    
    // Domains
    listDomains(): Promise<ProviderDomain[]>;
    getDomain(domainOrZoneId: string): Promise<ProviderDomain>;
    
    // DNS Records
    listRecords(domainOrZoneId: string): Promise<ProviderDnsRecord[]>;
    createRecord(domainOrZoneId: string, record: CreateRecordInput): Promise<ProviderDnsRecord>;
    updateRecord(domainOrZoneId: string, recordId: string, record: UpdateRecordInput): Promise<ProviderDnsRecord>;
    deleteRecord(domainOrZoneId: string, recordId: string): Promise<void>;
    
    // Sync
    fullSync(domainOrZoneId: string): Promise<SyncResult>;
  }
  ```
- [ ] Provider registry: map of provider type → implementation class
- [ ] Provider connection stored in DB with encrypted credentials (see Security section)
- [ ] Each provider implementation handles API-specific quirks (pagination, rate limits, error formats)

### Cloudflare DNS API (First Provider — Most Common for Technical Users)
- [ ] Implement `CloudflareDnsProvider`:
  - Auth via API token (scoped: `Zone:Read`, `Zone:Edit`, `DNS:Read`, `DNS:Edit`)
  - `GET /zones` → list all zones (domains) on the account
  - `GET /zones/:id/dns_records` → list all records
  - `POST /zones/:id/dns_records` → create record
  - `PATCH /zones/:id/dns_records/:id` → update record
  - `DELETE /zones/:id/dns_records/:id` → delete record
  - Handle Cloudflare-specific features: proxied vs. DNS-only, auto-TTL
- [ ] Auto-import: connect Cloudflare → automatically import all zones and their records into DomainPilot
- [ ] Two-way sync: local change → push to Cloudflare; Cloudflare change (detected via periodic pull) → update local DB and log as external change
- [ ] Respect Cloudflare API rate limits (1200 req/5 min) — queue and batch requests

### GoDaddy API
- [ ] Implement `GoDaddyDnsProvider`:
  - Auth via API key + secret
  - `GET /v1/domains` → list domains
  - `GET /v1/domains/:domain/records` → list records
  - `PUT /v1/domains/:domain/records/:type/:name` → update records
  - `PATCH /v1/domains/:domain/records` → add records
  - Handle GoDaddy quirk: PUT replaces ALL records of a type, not just one — need to merge carefully
- [ ] Pull registrar metadata: expiry, auto-renew, locked status, nameservers, contact info

### Namecheap API
- [ ] Implement `NamecheapDnsProvider`:
  - Auth via API key + whitelisted IP (Namecheap requires IP whitelisting — document this clearly)
  - `namecheap.domains.getList` → list domains
  - `namecheap.domains.dns.getHosts` → list DNS records
  - `namecheap.domains.dns.setHosts` → set ALL records at once (Namecheap replaces the entire record set — very dangerous, need to merge carefully)
  - Handle Namecheap's XML API format (not JSON)

### AWS Route 53
- [ ] Implement `Route53DnsProvider`:
  - Auth via AWS access key + secret (or IAM role if running on AWS)
  - `ListHostedZones` → list zones
  - `ListResourceRecordSets` → list records
  - `ChangeResourceRecordSets` → create/update/delete (batched change sets)
  - Handle Route 53 alias records (AWS-specific, no direct equivalent in other providers)
  - Handle Route 53's unique change-batch model (multiple changes in one request)

### Vercel DNS API (Common for Frontend Agencies)
- [ ] Implement `VercelDnsProvider`:
  - Auth via Vercel API token
  - List projects → list domains per project
  - Get/set DNS records for Vercel-managed domains

### Provider Connection UI & Flow
- [ ] Settings → Providers page:
  - List connected providers with status (connected / error / syncing)
  - "Connect Provider" flow: select provider → enter API key → test connection → import domains
  - Per-provider sync button: "Sync now" triggers an immediate full sync
  - Last sync timestamp and result (success / X errors)
  - Disconnect provider (with confirmation — warns that local data persists but live sync stops)
- [ ] Connection health monitoring: periodically test each connection (API key still valid, not revoked) and alert if a connection breaks

### Sync Engine
- [ ] Background sync via Cloudflare Cron Triggers:
  - Every 15 minutes: pull DNS records from all connected providers, compare with local DB
  - On diff detected: log as external change in `dns_change_history` with `source = 'external_sync'`
  - Alert the user: "2 DNS records were changed on Cloudflare outside DomainPilot"
- [ ] Manual sync: "Sync now" button per domain or per provider
- [ ] Sync conflict resolution:
  - If local and remote both changed since last sync → mark as conflict, show diff, let user choose
  - If only remote changed → update local DB silently (log the change)
  - If only local changed (user made change in DomainPilot) → push to provider
- [ ] `sync_logs` table:
  ```sql
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL,
  provider_connection_id UUID NOT NULL,
  domain_id UUID,
  sync_type TEXT NOT NULL CHECK (sync_type IN ('pull', 'push', 'full')),
  records_added INTEGER DEFAULT 0,
  records_updated INTEGER DEFAULT 0,
  records_deleted INTEGER DEFAULT 0,
  conflicts INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'partial', 'failed')),
  error_message TEXT,
  details JSONB
  ```

---

## 4. Real WHOIS & SSL Monitoring

Agencies need to know the real status of their clients' domains — not just
what's in a database. WHOIS and SSL data must come from live checks.

### WHOIS Integration
- [ ] Integrate with a WHOIS API (WhoisXMLAPI — $10/month for 500 lookups, or Whois.js for basic parsing):
  - On domain add: auto-lookup WHOIS to populate registrar, expiry, nameservers, registrant org
  - On demand: "Refresh WHOIS" button per domain
  - Periodic: re-check WHOIS monthly for all domains to detect transfers, expiry changes, registrar changes
- [ ] `whois_cache` table:
  ```sql
  id UUID PRIMARY KEY,
  domain_id UUID NOT NULL REFERENCES domains(id),
  raw_json JSONB NOT NULL,
  registrar TEXT,
  registrant_org TEXT,
  registrant_country TEXT,
  nameservers JSONB,              -- ["ns1.cloudflare.com", "ns2.cloudflare.com"]
  creation_date TIMESTAMPTZ,
  expiry_date TIMESTAMPTZ,
  updated_date TIMESTAMPTZ,
  dnssec_enabled BOOLEAN,
  fetched_at TIMESTAMPTZ NOT NULL
  ```
- [ ] Detect WHOIS changes: compare new lookup with cached data, alert on:
  - Registrar changed (domain was transferred)
  - Expiry date changed (renewed or shortened)
  - Nameservers changed (DNS hosting moved)
  - Registrant changed (ownership transferred)

### SSL Certificate Monitoring
- [ ] Implement SSL checker (TLS handshake to port 443, extract certificate):
  - On Workers: use `fetch("https://<domain>")` and extract cert info from response headers, or use an external SSL check API (SSL Labs, crt.sh)
  - Store: issuer, valid_from, valid_to, SANs, serial number, signature algorithm
- [ ] `ssl_checks` table:
  ```sql
  id UUID PRIMARY KEY,
  domain_id UUID NOT NULL REFERENCES domains(id),
  issuer TEXT,
  valid_from TIMESTAMPTZ,
  valid_to TIMESTAMPTZ,
  sans JSONB,                     -- ["example.com", "www.example.com", "*.example.com"]
  serial_number TEXT,
  is_valid BOOLEAN,
  check_error TEXT,               -- null if valid, error message if check failed
  checked_at TIMESTAMPTZ NOT NULL
  ```
- [ ] Scheduled SSL checks: daily for all domains, store history
- [ ] Alerts: SSL expires within 30/14/7/1 days → notification to the team
- [ ] SSL history: track cert changes over time (useful for agencies: "client's cert was renewed on X by Y")

### Certificate Transparency Monitoring
- [ ] Watch crt.sh / CT logs for unexpected certificates issued for the org's domains
- [ ] Alert: "A certificate was issued for client-domain.com by Let's Encrypt that wasn't requested through DomainPilot — possible compromise or shadow IT"
- [ ] This is a genuinely unique security feature that almost no domain tool offers to agencies

### DNS Propagation Checker
- [ ] After any DNS change (local or pushed to provider), check propagation:
  - Query 8.8.8.8 (Google), 1.1.1.1 (Cloudflare), 9.9.9.9 (Quad9), 208.67.222.222 (OpenDNS)
  - Show propagation status in UI: "Propagated to 3/4 resolvers"
  - Poll every 30s until fully propagated or 10 minutes elapsed
- [ ] Useful for agencies who just changed DNS for a client and need to tell them "it's live"

---

## 5. Cross-Provider Intelligence (The Unique Moat)

This is what no other tool does well and what makes DomainPilot worth paying
for. An agency with 200 domains across 4 providers currently has ZERO
visibility into cross-provider issues.

### Unified Dashboard
- [ ] Single dashboard showing ALL domains from ALL providers in one table
- [ ] Filter by: provider, client, registrar, status, expiry range, DNS hosting, tags
- [ ] Sort by: name, expiry date, last modified, client, provider
- [ ] Group by: client, provider, status, registrar

### Drift Detection & Alerting
- [ ] Compare DomainPilot's DB state vs. live provider state on every sync
- [ ] Detect and categorize drifts:
  - **Record added externally**: someone added a record directly in Cloudflare/GoDaddy outside DomainPilot
  - **Record modified externally**: value, TTL, or priority changed
  - **Record deleted externally**: record exists in our DB but not at the provider
  - **Domain added externally**: new domain appeared in a connected provider (someone registered a new domain)
- [ ] Drift dashboard: "5 unreviewed external changes across 3 domains"
- [ ] Per-drift actions: "Accept" (update local DB to match), "Revert" (push our DB state back to provider), "Ignore"
- [ ] This is CRITICAL for agencies: "Someone at the client's company logged into Cloudflare and changed the A record, breaking the site — DomainPilot caught it"

### Cross-Provider Conflict Detection
- [ ] Detect: domain registered at GoDaddy, NS records point to Cloudflare, but there's also a hosted zone on Route 53 with different records — which one is authoritative?
- [ ] Detect: two providers have conflicting A records for the same domain
- [ ] Detect: nameservers in WHOIS don't match any connected provider (orphaned DNS hosting)
- [ ] Show conflicts as warnings in the domain detail page with clear resolution steps

### Security Posture Dashboard
- [ ] Scan all domains for:
  - Missing SPF record (email spoofing risk)
  - Missing DMARC record (email spoofing risk)
  - Missing DKIM record (email deliverability issue)
  - Missing CAA record (any CA can issue certs)
  - DNSSEC not enabled
  - Stale records (e.g., A record pointing to an IP that returns 404/timeout)
  - Open redirect records (CNAME to a domain you don't control that has expired)
  - Dangling DNS: subdomain pointing to a deprovisioned cloud resource (AWS, Heroku, etc.) — subdomain takeover risk
- [ ] Security score per domain: 0-100 based on checks passed
- [ ] Org-wide security score: average across all domains
- [ ] "Fix it" buttons: the AI suggests the exact record to add and can apply it with one click
- [ ] Weekly security report email to the team: "3 domains dropped below 70 security score this week"

### Cost Intelligence
- [ ] Track annual renewal cost per domain (from WHOIS or manual entry)
- [ ] Total portfolio cost: "You spend $2,847/year on domain renewals"
- [ ] Cost breakdown by registrar, by client, by status (active vs. parked)
- [ ] Recommendations:
  - "12 domains on GoDaddy at $18/year each — Cloudflare Registrar charges $10/year. Transfer to save $96/year"
  - "7 domains are parked with no traffic and no DNS records — consider letting them expire to save $126/year"
  - "3 domains expired 6 months ago and are still in your portfolio — remove them to clean up"
- [ ] Renewal forecast: "Next 30 days: 4 renewals totaling $52. Next 90 days: 11 renewals totaling $187"

### AI "What-If" Analysis
- [ ] User asks: "What happens if I change the A record for client-site.com from 1.2.3.4 to 5.6.7.8?"
- [ ] AI explains: "This will point client-site.com and all subdomains that CNAME to it to a new IP. The following services may be affected: [lists services based on current records]. Email (MX) won't be affected. Propagation typically takes 5-30 minutes depending on TTL (current TTL: 300s)."
- [ ] User asks: "What if I transfer example.com from GoDaddy to Cloudflare?"
- [ ] AI explains: "You'd need to unlock the domain at GoDaddy, get an auth code, initiate transfer at Cloudflare ($10). DNS records will need to be recreated at Cloudflare — I can do that automatically from our database. Downtime risk is minimal if you pre-configure DNS at Cloudflare before updating nameservers."

---

## 6. Database Schema — Complete Expansion

Everything needed for the full agency/team product.

### Core Tables (New or Modified)
- [ ] `organizations` (see Section 1)
- [ ] `org_memberships` (see Section 1)
- [ ] `clients` (see Section 1)
- [ ] Modify `users` table: add `default_org_id`, `last_login_at`, `avatar_url`
- [ ] Modify `domains` table — add:
  - `org_id UUID NOT NULL REFERENCES organizations(id)` — all domain data scoped to org
  - `client_id UUID REFERENCES clients(id)` — optional, for agency client grouping
  - `provider_connection_id UUID REFERENCES provider_connections(id)` — where DNS is hosted
  - `registrar_provider_connection_id UUID REFERENCES provider_connections(id)` — where domain is registered
  - `provider_zone_id TEXT` — Cloudflare zone ID, Route53 hosted zone ID, etc.
  - `auto_renew BOOLEAN`
  - `locked BOOLEAN` — transfer lock status
  - `nameservers JSONB` — ["ns1.cloudflare.com", ...]
  - `whois_privacy BOOLEAN`
  - `annual_cost DECIMAL(10,2)` — renewal cost
  - `purchase_price DECIMAL(10,2)` — what was paid for it
  - `estimated_value DECIMAL(10,2)` — AI-estimated or user-set
  - `tags JSONB` — ["production", "client-acme", "marketing"]
  - `client_id UUID REFERENCES clients(id)` — which client this domain belongs to
- [ ] Modify `dns_records` table — add:
  - `org_id UUID NOT NULL` — for fast org-scoped queries
  - `provider_record_id TEXT` — the ID at the provider (Cloudflare record ID, etc.)
  - `proxied BOOLEAN` — Cloudflare-specific: orange cloud on/off
  - `sync_status TEXT CHECK (sync_status IN ('synced', 'local_only', 'conflict', 'pending_push'))`
- [ ] Modify `dns_change_history` table — add:
  - `org_id UUID NOT NULL`
  - `user_id UUID REFERENCES users(id)` — who made the change
  - `source TEXT` — expanded: 'user', 'ai_chat', 'bulk_update', 'provider_sync', 'external', 'api'
  - `provider_connection_id UUID` — which provider the change was pushed to
  - `sync_status TEXT` — 'pushed', 'pending', 'failed'

### Provider Tables
- [ ] `provider_connections`:
  ```sql
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id),
  provider_type TEXT NOT NULL CHECK (provider_type IN ('cloudflare', 'godaddy', 'namecheap', 'route53', 'vercel')),
  display_name TEXT,              -- user-chosen label: "Acme Cloudflare Account"
  credentials_encrypted TEXT NOT NULL,  -- AES-256-GCM encrypted JSON blob
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'error', 'revoked', 'testing')),
  last_sync_at TIMESTAMPTZ,
  last_sync_status TEXT,
  last_error TEXT,
  domains_count INTEGER DEFAULT 0,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
  ```
- [ ] `sync_logs` (see Section 3)

### Chat Tables
- [ ] `chat_conversations` (see Section 2)
- [ ] `chat_messages` (see Section 2)

### Monitoring Tables
- [ ] `whois_cache` (see Section 4)
- [ ] `ssl_checks` (see Section 4)

### Notification Tables
- [ ] `notification_channels`:
  ```sql
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id),
  channel_type TEXT NOT NULL CHECK (channel_type IN ('email', 'slack', 'discord', 'webhook')),
  config JSONB NOT NULL,          -- {"webhook_url": "..."} or {"email": "..."}
  enabled BOOLEAN DEFAULT true,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
  ```
- [ ] `notification_rules`:
  ```sql
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id),
  event_type TEXT NOT NULL,       -- 'domain_expiry', 'ssl_expiry', 'drift_detected', 'security_issue', 'weekly_digest'
  threshold_days INTEGER,         -- for expiry events: alert X days before
  channel_id UUID NOT NULL REFERENCES notification_channels(id),
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
  ```
- [ ] `notifications_sent`:
  ```sql
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL,
  rule_id UUID REFERENCES notification_rules(id),
  channel_id UUID NOT NULL REFERENCES notification_channels(id),
  event_type TEXT NOT NULL,
  domain_id UUID REFERENCES domains(id),
  subject TEXT,
  body TEXT,
  status TEXT CHECK (status IN ('sent', 'failed', 'pending')),
  sent_at TIMESTAMPTZ,
  error TEXT
  ```

### Activity & Audit Tables
- [ ] `audit_log`:
  ```sql
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id),
  user_id UUID NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,           -- 'domain.create', 'dns.update', 'provider.connect', 'member.invite', 'settings.change'
  resource_type TEXT,             -- 'domain', 'dns_record', 'provider', 'member'
  resource_id TEXT,
  details JSONB,                  -- {"old": {...}, "new": {...}}
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
  ```
- [ ] Audit log is APPEND-ONLY — never delete entries
- [ ] Audit log page in the frontend: filterable by user, action, resource, date range
- [ ] Required for SOC 2 compliance (see Security section)

### Indexes (Critical for Performance at Scale)
- [ ] `domains`: org_id, client_id, status, expiry_date, (org_id + domain UNIQUE)
- [ ] `dns_records`: org_id, domain_id, (domain_id + subdomain + record_type), provider_record_id
- [ ] `dns_change_history`: org_id, domain_id, changed_at DESC, user_id
- [ ] `audit_log`: org_id, created_at DESC, user_id, action
- [ ] `chat_messages`: conversation_id, created_at
- [ ] `provider_connections`: org_id, provider_type
- [ ] `whois_cache`: domain_id, fetched_at DESC
- [ ] `ssl_checks`: domain_id, checked_at DESC

---

## 7. Notifications & Alerting

Agencies can't afford to miss a domain expiry for a client. Alerting is not
a nice-to-have — it's the reason they pay for the tool.

### Email Notifications (Priority 1)
- [ ] Use **Resend** (easy API, good free tier: 3000 emails/month) or Cloudflare Email Workers
- [ ] Transactional emails:
  - Domain expiry reminders: 60, 30, 14, 7, 3, 1 days before
  - SSL expiry reminders: 30, 14, 7, 1 days before
  - External drift detected: immediately
  - Security issue found: immediately
  - Team member invitation
  - Weekly digest
- [ ] Branded email templates with the org's name and DomainPilot branding
- [ ] Per-user email preferences: choose which alerts to receive
- [ ] Email delivery tracking: sent, opened (via pixel), bounced

### Slack Integration
- [ ] Slack incoming webhook: user provides a webhook URL in Settings
- [ ] Formatted Slack messages with action buttons where possible
- [ ] Alerts sent to Slack: expiry warnings, drift detection, security issues, approval requests
- [ ] Daily summary to Slack channel (optional)

### Discord Integration
- [ ] Discord webhook: same pattern as Slack
- [ ] Formatted embeds with color-coded severity

### Custom Webhooks
- [ ] POST to any URL on events
- [ ] Configurable per event type
- [ ] Retry with exponential backoff (3 attempts)
- [ ] Webhook signature (HMAC-SHA256) so receivers can verify authenticity

### In-App Notifications
- [ ] Notification bell in the sidebar with unread count badge
- [ ] Notification feed: scrollable list of recent alerts with timestamps
- [ ] Click notification → navigate to the relevant domain/page
- [ ] Mark as read / mark all as read
- [ ] Notification preferences: per-type toggles for email, Slack, in-app

### Cron-Based Scheduled Checks (Cloudflare Cron Triggers)
- [ ] Every 15 minutes: sync connected providers (detect drift)
- [ ] Every hour: check domain expiry dates, generate alerts
- [ ] Daily at 2am UTC: run SSL checks for all domains
- [ ] Daily at 3am UTC: run WHOIS re-checks for domains expiring within 90 days
- [ ] Weekly (Monday 8am UTC): generate and send weekly digest
- [ ] Monthly: full WHOIS refresh for all domains

---

## 8. Frontend — Agency-Optimized UI

The current UI is a generic dashboard. For agencies, the UI needs to be
organized around clients and workflows, not just a flat list of domains.

### Navigation Restructure
- [ ] Sidebar redesign:
  - Org switcher at the top (for users in multiple orgs)
  - Dashboard (overview)
  - Domains (flat list + search/filter)
  - Clients (list of clients, click → client's domains)
  - DNS Management
  - Monitoring (WHOIS, SSL, health checks)
  - History & Audit
  - Alerts
  - Chat (AI assistant)
  - Settings (org, team, providers, billing, notifications)
- [ ] Breadcrumbs for navigation context

### Chat Experience (Critical — This Is the Differentiator)
- [ ] Persistent chat panel: slide-out drawer from the right side, accessible from EVERY page via a floating button or keyboard shortcut (Cmd+K)
- [ ] Chat is contextual: if you open chat from a domain detail page, the AI already knows which domain you're looking at
- [ ] Streaming token rendering with typing indicator
- [ ] Tool-call activity shown inline: "Querying DNS records for acme.com..." with a subtle spinner
- [ ] Structured data rendering in chat:
  - DNS records as a formatted table
  - Domain info as a card
  - Health check results as a checklist with green/red indicators
  - Bulk operation plans as a numbered list with approve/reject buttons
- [ ] Quick-action buttons in AI responses: "Apply", "Approve All", "View Domain", "Undo"
- [ ] Suggested prompts for new users:
  - "Show me domains expiring this month"
  - "Check the health of acme.com"
  - "Add a CNAME record for blog.acme.com pointing to acme.vercel.app"
  - "Generate a security report for all of Acme Corp's domains"
- [ ] Chat history sidebar: list of past conversations, click to load

### Dashboard
- [ ] Org-wide overview:
  - Total domains, active, expiring soon, expired
  - Security posture score (0-100) with trend arrow
  - Pending approvals card (with approve/reject inline)
  - Recent activity timeline
  - Upcoming renewals (next 30 days) with cost total
  - Provider status (connected providers with sync health)
- [ ] Client breakdown: mini cards showing each client's domain count and health status
- [ ] Quick actions: "Add domain", "Connect provider", "Run health check"

### Domains Page
- [ ] Table with columns: Domain, Client, Provider, Registrar, Expiry, SSL, Status, Security Score, Last Modified
- [ ] Bulk selection with checkbox column
- [ ] Bulk actions bar: "Move to client", "Sync", "Change status", "Delete" (with confirmation)
- [ ] Advanced filter panel: by client, provider, registrar, status, expiry range, security score range, tags
- [ ] Column sorting (click header to sort)
- [ ] Saved filters: "Expiring this month", "Acme Corp domains", "Security issues"
- [ ] Import domains: CSV upload with column mapping, or bulk text paste (one domain per line)
- [ ] Export: CSV, JSON

### Domain Detail Page (`/app/domains/:id`)
- [ ] Tabs: Overview, DNS Records, Change History, Health, WHOIS, SSL
- [ ] Overview tab: domain metadata, registrar, expiry, status, client, tags, notes, cost, provider links
- [ ] DNS tab: live record table with add/edit/delete, propagation status, diff view for recent changes
- [ ] History tab: full change log with filters (by record type, by user, by date range)
- [ ] Health tab: health check results, security score breakdown, "Fix" buttons
- [ ] WHOIS tab: parsed WHOIS data, last checked timestamp, "Refresh" button
- [ ] SSL tab: cert details, validity, SANs, history of cert changes

### Client Pages (`/app/clients/:id`)
- [ ] Client overview: name, contact info, notes
- [ ] Client's domains table (same as domains page but filtered to this client)
- [ ] Client health summary: X domains healthy, Y with issues
- [ ] "Generate report" button: creates a shareable PDF/link with the client's domain health status
- [ ] Client activity log: all changes made to this client's domains

### Settings Pages
- [ ] `/app/settings/organization` — org name, slug, billing
- [ ] `/app/settings/team` — members list, invite, roles, remove
- [ ] `/app/settings/providers` — connected providers, add new, sync status, test connection
- [ ] `/app/settings/notifications` — channels (email, Slack, Discord, webhooks), rules per event type
- [ ] `/app/settings/billing` — current plan, usage, upgrade, manage Stripe subscription, invoices
- [ ] `/app/settings/api-keys` — generate API keys for external integrations
- [ ] `/app/settings/security` — password change, 2FA, session management
- [ ] `/app/settings/export` — download all data as CSV/JSON

---

## 9. Security, Trust & Compliance

Agencies are handing over API keys that can modify their clients' DNS.
A breach means their entire client base is compromised. Security isn't
optional — it's the product. You need SOC 2, proper encryption, and a
track record to earn that trust.

### Encryption
- [ ] **API key encryption at rest**: AES-256-GCM encryption for all stored provider credentials
  - Encryption key stored as a Cloudflare secret (`ENCRYPTION_KEY`), never in source code
  - Keys decrypted only at the moment of use, never logged, never returned in API responses
  - Key rotation strategy: support re-encrypting all credentials with a new key
- [ ] **Database encryption**: Neon supports encryption at rest by default — verify and document
- [ ] **TLS everywhere**: all API calls over HTTPS (already the case with Cloudflare Workers)
- [ ] Never store plaintext API keys in logs, error messages, or frontend responses

### Authentication & Session Security
- [ ] Firebase Auth is the current auth layer — ensure:
  - ID tokens are verified on EVERY request (currently done via Google Identity Toolkit API call — consider using a local JWT verification library for speed)
  - Token expiry is enforced
  - Revoked tokens are rejected
- [ ] Session management: track active sessions, allow users to revoke other sessions
- [ ] Optional: add password-based auth as alternative to Firebase (some agencies prefer not to depend on Google)

### Rate Limiting
- [ ] Per-user rate limits: 100 req/min for reads, 30 req/min for writes
- [ ] Per-IP rate limits: 200 req/min
- [ ] Per-org rate limits for provider sync: prevent accidental DDoS of Cloudflare/GoDaddy APIs
- [ ] Return proper 429 responses with `Retry-After` header

### Audit Trail (SOC 2 Requirement)
- [ ] Every mutation is logged in `audit_log`: who, what, when, from where
- [ ] Audit logs are immutable — no delete/update endpoints
- [ ] Audit log retention: minimum 1 year (configurable per org/plan)
- [ ] Audit log export: CSV download for compliance reviews
- [ ] Track: login events, domain changes, DNS changes, provider connections, member changes, role changes, billing changes, API key creation/deletion

### SOC 2 Readiness (For Enterprise Sales)
- [ ] **SOC 2 Type I** is the minimum to sell to agencies handling client infrastructure
- [ ] Required controls:
  - [ ] Access control: RBAC implemented and enforced
  - [ ] Encryption: data encrypted at rest and in transit
  - [ ] Audit logging: comprehensive, immutable logs
  - [ ] Incident response: documented procedure for security incidents
  - [ ] Vendor management: document all third-party services (Neon, Cloudflare, Firebase, Stripe)
  - [ ] Change management: documented deployment process
  - [ ] Availability: uptime monitoring, incident status page
- [ ] Use a tool like **Vanta** or **Drata** to automate SOC 2 evidence collection (expensive but worth it for enterprise sales)
- [ ] Alternatively, start with a **security page** on the website documenting your security practices — this unblocks many agency sales even without formal SOC 2

### Additional Security Measures
- [ ] **CORS hardening**: replace `*.vercel.app` wildcard with the specific deployed frontend URL
- [ ] **Content Security Policy** headers on all frontend responses
- [ ] **Input validation**: every endpoint validates and sanitizes input (partially done via Zod — ensure 100% coverage)
- [ ] **SQL injection prevention**: parameterized queries everywhere (audit all `pgQuery` calls)
- [ ] **Dependency scanning**: `npm audit` in CI, Dependabot or Renovate for automatic updates
- [ ] **Secret scanning**: ensure no API keys or secrets in source code (use git-secrets or gitleaks in CI)
- [ ] **Two-factor confirmation** for: deleting a domain, disconnecting a provider, removing a team member, bulk operations, API key creation

---

## 10. API & External Integrations

Agencies use many tools. DomainPilot needs to play well with their stack.

### Public REST API
- [ ] Versioned API: `/api/v1/...`
- [ ] API key authentication (separate from Firebase tokens — for scripts, CI, integrations):
  - `api_keys` table: id, org_id, key_hash, name, scopes, last_used_at, expires_at, created_by, created_at
  - Keys shown once on creation, stored as bcrypt hash
  - Scopes: `domains:read`, `domains:write`, `dns:read`, `dns:write`, `health:read`
- [ ] Endpoints:
  - `GET /api/v1/domains` — list domains (supports filters, pagination)
  - `GET /api/v1/domains/:id` — get domain details
  - `POST /api/v1/domains` — add domain
  - `PATCH /api/v1/domains/:id` — update domain
  - `DELETE /api/v1/domains/:id` — delete domain
  - `GET /api/v1/domains/:id/records` — list DNS records
  - `POST /api/v1/domains/:id/records` — add DNS record
  - `PATCH /api/v1/domains/:id/records/:recordId` — update record
  - `DELETE /api/v1/domains/:id/records/:recordId` — delete record
  - `GET /api/v1/domains/:id/health` — health check
  - `GET /api/v1/domains/:id/whois` — WHOIS data
  - `GET /api/v1/domains/:id/ssl` — SSL check
  - `GET /api/v1/audit-log` — audit log (paginated)
  - `POST /api/v1/sync/:providerId` — trigger provider sync
- [ ] Proper error responses: `{ "error": { "code": "...", "message": "..." } }`
- [ ] OpenAPI / Swagger spec auto-generated from route definitions
- [ ] Rate limiting per API key

### DNS-as-Code
- [ ] `domainpilot export <domain>` → YAML/JSON file with all DNS records
- [ ] `domainpilot apply <file>` → apply DNS config from file (diff first, then apply)
- [ ] AI can generate DNS config files from natural language: "Generate a DNS config for a Vercel-hosted site with Google Workspace email"
- [ ] Version control friendly: store DNS configs in Git, use DomainPilot API in CI to apply changes
- [ ] CLI tool: `npx domainpilot-cli export example.com --api-key=dp_xxx`

### Terraform Provider (Future)
- [ ] `terraform-provider-domainpilot`: manage domains and DNS records via Terraform
- [ ] Resources: `domainpilot_domain`, `domainpilot_dns_record`
- [ ] Data sources: `domainpilot_domain`, `domainpilot_dns_records`

### Zapier / Make.com Integration
- [ ] Triggers: domain added, domain expiring, DNS changed, health check failed
- [ ] Actions: add domain, add DNS record, run health check
- [ ] Enables agencies to build custom workflows: "When a domain expires → create a Jira ticket"

### Slack Bot (Beyond Webhooks)
- [ ] Install DomainPilot as a Slack app
- [ ] Slash commands: `/domainpilot check example.com`, `/domainpilot expiring`, `/domainpilot status`
- [ ] Interactive approvals: approval request sent to Slack, team member clicks Approve/Reject directly in Slack

---

## 11. Billing & Monetization — Agency-Focused Tiers

### Pricing Structure
- [ ] **Free**: 5 domains, 1 user, 0 provider connections, manual management only, basic expiry alerts, 50 AI messages/month
- [ ] **Pro ($15/month)**: 50 domains, 3 users, 2 provider connections, all monitoring (WHOIS, SSL), all alerts, unlimited AI chat, API access
- [ ] **Agency ($49/month)**: 500 domains, 10 users, unlimited provider connections, client management, team RBAC, branded client reports, priority support, all integrations
- [ ] **Enterprise ($149/month or custom)**: unlimited everything, SSO (SAML/OIDC), SLA, dedicated support, custom integrations, SOC 2 report access, audit log export
- [ ] Annual billing: 2 months free (e.g., Pro $150/year instead of $180)

### Feature Gating
- [ ] Backend: check org's plan limits before executing operations
  - Reject domain creation if at plan limit
  - Reject provider connection if at plan limit
  - Reject team invite if at seat limit
  - Return `{ "error": "upgrade_required", "plan_limit": "domains", "current": 50, "max": 50 }` so frontend can show an upgrade prompt
- [ ] Frontend: show upgrade prompts inline when limits are approached
  - "You've used 48 of 50 domains — upgrade to Agency for up to 500"
  - Locked features show a lock icon with "Available on Agency plan"

### Usage Tracking
- [ ] Track per billing period: domains, AI messages, API calls, provider syncs, team members
- [ ] Usage dashboard in Settings → Billing
- [ ] Overage handling: soft limit with warning, then hard limit (don't break existing functionality, just block new additions)

### Stripe Integration (Expand Current)
- [ ] Multiple price IDs for each plan tier
- [ ] Plan upgrade/downgrade via Stripe Customer Portal
- [ ] Seat-based pricing for Agency/Enterprise (price per additional seat beyond included)
- [ ] Invoice history page
- [ ] Failed payment handling: grace period (7 days), then downgrade to Free
- [ ] Cancellation flow: show what they'll lose, offer discount, then process

---

## 12. Testing & Quality

### Backend Tests
- [ ] Unit tests for every Postgres query function (use a test database)
- [ ] Unit tests for every tool execution path with mocked DB
- [ ] Integration tests for provider implementations with mocked API responses (nock/msw)
- [ ] Integration tests for the AI tool-calling loop with mocked LLM responses
- [ ] Test RBAC enforcement: verify that a Viewer can't create domains, a Member can't delete providers, etc.
- [ ] Test org scoping: verify that user A can never access org B's data
- [ ] Test rate limiting
- [ ] Test encryption/decryption of provider credentials
- [ ] Aim for >80% code coverage on backend

### Frontend Tests
- [ ] React Testing Library tests for:
  - Auth flow (login, signup, logout)
  - Add domain flow
  - Edit domain flow
  - Chat interaction (send message, see response)
  - Provider connection flow
  - Team invite flow
  - Dashboard data loading
  - RBAC: verify UI elements hidden for restricted roles
- [ ] Visual regression tests with Chromatic or Percy (optional but useful for UI-heavy app)

### E2E Tests
- [ ] Playwright tests for critical user journeys:
  - Sign up → create org → add domain → configure DNS → check health
  - Connect Cloudflare provider → auto-import → view unified dashboard
  - Invite team member → member accepts → member adds domain → admin approves change
  - AI chat: ask a question → get answer with tool calls → approve suggested change
  - Billing: upgrade plan → verify new limits → downgrade
- [ ] Run E2E tests against a staging environment, not production

### CI/CD
- [ ] GitHub Actions pipeline:
  - On PR: lint, typecheck, unit tests, build
  - On merge to main: all of the above + E2E tests + deploy to staging
  - On release tag: deploy to production
- [ ] Staging environment: separate Cloudflare Worker + Vercel preview deployment + separate Neon database branch
- [ ] Preview deployments: every PR gets a preview URL (Vercel does this automatically)

---

## 13. Performance & Scalability

### Database
- [ ] Proper indexes on every table (see Section 6)
- [ ] Cursor-based pagination for all list endpoints (not OFFSET — OFFSET is slow for large datasets)
- [ ] Connection pooling via Neon's pooler endpoint (already in DATABASE_URL)
- [ ] Query analysis: run EXPLAIN ANALYZE on critical queries, optimize any full table scans
- [ ] Consider read replicas if query load grows (Neon supports this)

### Caching
- [ ] Cache provider API responses in Cloudflare KV (e.g., Cloudflare zone list cached for 5 minutes)
- [ ] Cache WHOIS data (re-fetch at most once per day per domain)
- [ ] Cache SSL check results (re-check at most once per day per domain)
- [ ] Frontend: React Query with stale-while-revalidate for dashboard data

### Background Jobs
- [ ] Use Cloudflare Queues for async operations:
  - Provider sync (can take 30s+ for large accounts)
  - WHOIS lookups (external API, can be slow)
  - SSL checks (TLS handshake, can timeout)
  - Notification delivery
  - Report generation
- [ ] Job status tracking: show "Sync in progress..." in the UI, poll for completion

### API Performance
- [ ] Target: <200ms p95 for read endpoints, <500ms p95 for write endpoints
- [ ] Cloudflare Workers already provide edge execution — leverage this
- [ ] Minimize Postgres round-trips: batch queries where possible
- [ ] Streaming for chat (SSE) to avoid timeouts on long AI responses

---

## 14. Polish & Launch Readiness

### Onboarding
- [ ] First-run wizard:
  1. "Name your organization" (or skip for personal use)
  2. "Connect a DNS provider" (Cloudflare/GoDaddy/Namecheap with guided setup) — or "I'll add domains manually"
  3. Auto-import domains if provider connected → "We found 23 domains! Importing..."
  4. "Try the AI: ask DomainPilot to check the health of one of your domains"
  5. "Invite your team" (or skip)
- [ ] Empty states on every page with actionable CTAs (not just "No data")
- [ ] Tooltips for non-obvious features

### UI Polish
- [ ] Loading skeletons instead of spinners (on dashboard, domain list, DNS records)
- [ ] Optimistic UI updates for quick actions (add record → show immediately, revert on error)
- [ ] Toast notifications for actions (Sonner is already installed)
- [ ] Keyboard shortcuts: Cmd+K for AI chat, Cmd+N for new domain, Escape to close modals
- [ ] Mobile responsive: sidebar collapses to hamburger menu, tables become card layouts
- [ ] Dark mode is good (current) — add optional light mode for users who prefer it

### Landing Page & Marketing
- [ ] Rewrite landing page for agency audience:
  - Headline: "One dashboard for every domain you manage"
  - Subhead: "Connect Cloudflare, GoDaddy, Namecheap, Route 53 — manage DNS for all your clients with AI assistance"
  - Social proof: testimonials from beta agencies (when available)
  - Feature highlights focused on agency pain points: unified view, drift detection, client management, security posture
  - Pricing table with all tiers
  - Trust signals: "256-bit encryption", "SOC 2 in progress", "Your API keys never leave our encrypted vault"
- [ ] SEO: meta tags, Open Graph images, structured data (JSON-LD)
- [ ] Blog: "How agencies lose $X/year to missed domain renewals" (content marketing)

### Legal & Compliance (Required Before Handling Client DNS)
- [ ] **Terms of Service**: must include liability limitations for DNS changes, data handling, service availability
- [ ] **Privacy Policy**: GDPR-compliant if serving EU agencies — document data collection, storage, sharing, deletion
- [ ] **Data Processing Agreement (DPA)**: required by many agencies for GDPR compliance
- [ ] **Security page**: public page documenting encryption, access controls, infrastructure, incident response process
- [ ] **Status page**: use Instatus, Statuspage, or custom — show uptime, incident history
- [ ] **Cookie policy**: if using analytics on the landing page

### Documentation
- [ ] Getting started guide: sign up → connect provider → manage domains
- [ ] Provider setup guides: step-by-step for each provider (with screenshots of where to find API keys)
- [ ] AI chat guide: example conversations, what the AI can do, limitations
- [ ] API reference: auto-generated from OpenAPI spec
- [ ] FAQ / troubleshooting

---

## Priority Order — Build in This Sequence

### Phase 1: Foundation (Weeks 1-3) — Make It Real
1. **Postgres migration** (#0) — move all data to Postgres, scoped by org
2. **Organization model** (#1) — orgs, memberships, basic RBAC
3. **AI tool-calling** (#2) — the AI can actually invoke tools and access the database
4. **Chat streaming + history** (#2, #8) — chat feels responsive and persistent

### Phase 2: Core Value (Weeks 4-7) — Worth Paying For
5. **Cloudflare DNS provider** (#3) — first real provider integration, proves the concept
6. **Sync engine + drift detection** (#3, #5) — detect external changes, show diffs
7. **WHOIS + SSL monitoring** (#4) — auto-populate domain metadata, alert on expiry
8. **Email notifications** (#7) — expiry alerts, drift alerts, weekly digest
9. **Security posture dashboard** (#5) — SPF/DMARC/CAA checks, security score

### Phase 3: Agency Features (Weeks 8-11) — Differentiate
10. **Client management** (#1) — group domains by client, client reports
11. **Team invitations + RBAC enforcement** (#1) — multiple users per org with proper roles
12. **Frontend overhaul** (#8) — persistent chat panel, domain detail page, proper dashboard
13. **GoDaddy + Namecheap providers** (#3) — expand multi-provider story
14. **Billing tiers** (#11) — free/pro/agency/enterprise with feature gating

### Phase 4: Scale & Trust (Weeks 12-16) — Enterprise Ready
15. **API key encryption + security hardening** (#9) — AES-256, rate limiting, audit log
16. **Public REST API** (#10) — enable external integrations
17. **DNS-as-Code + CLI** (#10) — for technical agencies
18. **Slack/Discord integrations** (#7) — where agencies already collaborate
19. **Route 53 + Vercel providers** (#3) — full multi-cloud coverage
20. **Testing suite + CI/CD** (#12) — production confidence
21. **SOC 2 preparation** (#9) — start the formal compliance process
22. **Legal pages + status page** (#14) — launch prerequisites
