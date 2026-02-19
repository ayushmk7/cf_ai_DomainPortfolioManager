# DomainPilot — Master TODO

Everything needed to turn this from a local bookkeeping tool into a genuinely
unique, production-grade AI domain management platform.

---

## 0. Critical Foundation — Fix Postgres Integration

Right now domain data lives in Durable Object SQLite (per-user, ephemeral),
and Postgres (Neon) is only used for `users` and `subscriptions`.
All domain/DNS/history data needs to move to Postgres so it persists across
deploys, is queryable across users, and the AI can access it.

- [ ] Replace the Neon HTTP hack in `pg.ts` with the **@neondatabase/serverless** driver (WebSocket-based, works on Cloudflare Workers)
- [ ] Migrate domain data tables to Postgres:
  - `domains` — same schema as current SQLite but with proper Postgres types, foreign key to `users`
  - `dns_records` — same, FK to `domains`
  - `dns_change_history` — same, FK to `domains`
  - `scheduled_alerts` — same, FK to `domains`
- [ ] Add a `user_id` column to `domains` so each user's portfolio is scoped to their account
- [ ] Write proper migration SQL files (not inline strings) and a migration runner
- [ ] Add connection pooling config (Neon supports it via the pooler endpoint — already in the DATABASE_URL)
- [ ] Remove the Durable Object SQLite dependency for domain data (keep DO only for real-time agent state/sessions if needed)
- [ ] Add `DATABASE_URL` as a Wrangler secret for production deploys
- [ ] Update all agent methods (`addDomain`, `queryDomains`, etc.) to read/write from Postgres instead of `this.state.storage.sql`

---

## 1. Make the AI Actually Agentic (Tool-Calling)

The chat currently calls the LLM without passing tools — it's just a text-in,
text-out chatbot. The AI needs to actually invoke tools autonomously.

- [ ] Wire up proper **tool-calling** in `onChatMessage`:
  - Pass the full toolset definitions to the LLM (OpenAI function calling / Workers AI tool use)
  - Parse tool-call responses from the model
  - Execute the called tool, feed the result back to the model
  - Loop until the model produces a final text response
- [ ] Give the AI **read access to the Postgres database** so it can answer questions like:
  - "How many domains do I have?"
  - "Which domains expire this month?"
  - "Show me all MX records across my portfolio"
  - "What DNS changes did I make last week?"
- [ ] Add a `queryDatabase` tool that lets the AI run **read-only** SQL against the user's scoped data
  - Must enforce `user_id` scoping — AI can only see the authenticated user's data
  - Must be read-only (SELECT only, no mutations via raw SQL)
  - Should have a row limit to prevent massive result sets
- [ ] Add a `getUserProfile` tool so the AI knows who it's talking to (name, email, plan, domain count, account age)
- [ ] Add a `getSubscriptionStatus` tool so the AI can gate premium features
- [ ] Support multi-turn tool calling (AI calls tool → gets result → calls another tool → final answer)
- [ ] Add conversation history persistence (store chat history in Postgres per user, not just in-memory)
- [ ] Implement streaming responses (SSE) so the user sees tokens as they arrive, not a loading spinner then full response

---

## 2. Connect to Real DNS Providers (The Actual Moat)

Currently adding a DNS record writes to a local DB. It doesn't create a real
DNS record anywhere. This is the #1 thing that makes the app feel like a toy.

### Cloudflare DNS API
- [ ] Add Cloudflare API token support (user provides their API token in settings)
- [ ] Implement `cloudflare-dns-provider.ts`:
  - List zones → auto-import domains
  - List DNS records for a zone
  - Create / update / delete DNS records (real propagation)
  - Sync: pull real records into our DB, push local changes to Cloudflare
- [ ] Two-way sync: detect drift between our DB and Cloudflare's actual records
- [ ] Show propagation status after making a change

### GoDaddy API
- [ ] Add GoDaddy API key/secret support
- [ ] Implement `godaddy-dns-provider.ts`:
  - List domains from GoDaddy account
  - Get/set DNS records
  - Pull registrar info (expiry, auto-renew, nameservers)

### Namecheap API
- [ ] Add Namecheap API key support
- [ ] Implement `namecheap-dns-provider.ts`:
  - List domains
  - Get/set DNS host records
  - Pull WHOIS/registrar metadata

### AWS Route 53
- [ ] Add AWS access key support
- [ ] Implement `route53-dns-provider.ts`:
  - List hosted zones
  - List/create/update/delete record sets
  - Support alias records

### Provider Abstraction Layer
- [ ] Create a `DnsProvider` interface that all providers implement:
  ```
  listDomains() → Domain[]
  listRecords(domain) → DnsRecord[]
  createRecord(domain, record) → DnsRecord
  updateRecord(domain, recordId, record) → DnsRecord
  deleteRecord(domain, recordId) → void
  syncAll(domain) → SyncResult
  ```
- [ ] Provider registry: user connects providers in Settings, we store encrypted API keys in Postgres
- [ ] Unified "sync" operation: pull from all connected providers, merge into our DB, detect conflicts
- [ ] Background sync job: periodically pull from providers to catch external changes

---

## 3. Real WHOIS & SSL Monitoring

- [ ] Integrate WHOIS lookups (via `whois-json` or a WHOIS API like WhoisXMLAPI)
  - Auto-populate registrar, expiry date, nameservers, registrant info on domain add
  - Periodic re-check to detect transfers or expiry changes
- [ ] Real SSL certificate monitoring:
  - TLS connect to each domain, extract cert expiry, issuer, SANs
  - Store `ssl_expiry_date`, `ssl_issuer`, `ssl_valid` in `domains` table
  - Alert when SSL expires within 30/14/7/1 days
- [ ] Certificate Transparency log monitoring:
  - Watch for unexpected certs issued for user's domains (security alert)
- [ ] DNS propagation checker:
  - Query multiple public resolvers (8.8.8.8, 1.1.1.1, 9.9.9.9) after a record change
  - Show propagation status in the UI (propagated to X/Y resolvers)

---

## 4. Cross-Provider Intelligence (The Unique Value Prop)

Nobody does this well. This is where DomainPilot becomes genuinely unique.

- [ ] **Unified dashboard across all providers** — one view of every domain regardless of where it's registered or where DNS is hosted
- [ ] **Cross-provider conflict detection**:
  - "Your domain is registered at GoDaddy but NS records point to Cloudflare — is that intentional?"
  - "You have an A record on Cloudflare AND Route 53 for the same domain pointing to different IPs"
- [ ] **Drift detection & alerting**:
  - Compare our DB state vs live provider state
  - Alert on unexpected changes (someone edited DNS outside DomainPilot)
  - Show a diff view: "3 records changed externally since last sync"
- [ ] **Cost optimization recommendations**:
  - "You have 12 domains on GoDaddy at $15/yr each — Cloudflare is $10/yr, save $60/yr by transferring"
  - "3 of your domains are parked and unused — consider letting them expire to save $X"
- [ ] **Security recommendations**:
  - "example.com has no DMARC record — email spoofing is possible"
  - "Your SPF record includes 'include:_spf.google.com' but you're using Outlook — stale config"
  - "No CAA record — any CA can issue certs for your domain"
  - "DNSSEC is not enabled for example.com"
- [ ] **AI-powered "what-if" analysis**:
  - "What happens if I change the A record for example.com to 2.3.4.5?" → AI explains downstream effects (CDN, email, subdomains)

---

## 5. Database Schema Expansion (Postgres)

New tables and columns needed to support everything above.

- [ ] `provider_connections` table:
  ```sql
  id, user_id, provider (cloudflare|godaddy|namecheap|route53|manual),
  api_key_encrypted, api_secret_encrypted, extra_config_json,
  status (active|error|revoked), last_sync_at, created_at
  ```
- [ ] `domain_provider_links` table:
  ```sql
  id, domain_id, provider_connection_id, provider_zone_id,
  provider_domain_id, sync_status, last_synced_at
  ```
- [ ] `sync_logs` table:
  ```sql
  id, provider_connection_id, domain_id, sync_type (pull|push|full),
  records_added, records_updated, records_deleted, conflicts,
  started_at, completed_at, status, error_message
  ```
- [ ] `chat_history` table:
  ```sql
  id, user_id, role (user|assistant|system|tool),
  content, tool_name, tool_params_json, tool_result_json,
  created_at
  ```
- [ ] `user_preferences` table:
  ```sql
  id, user_id, alert_channels_json (email|slack|discord|webhook),
  default_ttl, default_provider_id, timezone, weekly_digest_enabled,
  created_at, updated_at
  ```
- [ ] `whois_cache` table:
  ```sql
  id, domain_id, raw_whois_json, registrar, registrant_org,
  nameservers_json, creation_date, expiry_date, updated_date,
  fetched_at
  ```
- [ ] `ssl_checks` table:
  ```sql
  id, domain_id, issuer, valid_from, valid_to, sans_json,
  is_valid, check_error, checked_at
  ```
- [ ] Add columns to `domains`:
  - `user_id` (FK to users — REQUIRED)
  - `provider_connection_id` (FK — where DNS is hosted)
  - `registrar_provider_connection_id` (FK — where domain is registered)
  - `auto_renew` (boolean)
  - `nameservers` (JSON array)
  - `whois_privacy` (boolean)
  - `purchase_price` (decimal — for portfolio valuation)
  - `estimated_value` (decimal — AI-estimated or user-set)
  - `tags` (JSON array — for organization)
  - `folder_id` (FK — for grouping)
- [ ] `domain_folders` table (user-created groups):
  ```sql
  id, user_id, name, color, icon, parent_folder_id, created_at
  ```
- [ ] Encryption at rest for API keys using a KMS or env-based encryption key

---

## 6. AI Enhancements

- [ ] **Context-aware system prompt**: inject user's domain count, plan, recent activity into the system prompt so the AI knows context without a tool call
- [ ] **Structured tool definitions** for the LLM:
  - `addDomain`, `updateDomain`, `deleteDomain`
  - `addDnsRecord`, `updateDnsRecord`, `deleteDnsRecord`
  - `queryDomains`, `getDnsRecords`, `getDnsHistory`
  - `searchHistory` (semantic via Vectorize)
  - `checkDomainHealth`
  - `runWhoisLookup`
  - `checkSslCertificate`
  - `syncProvider`
  - `queryDatabase` (read-only SQL)
  - `getUserProfile`, `getSubscriptionStatus`
  - `bulkUpdate`
  - `getAlerts`, `configureAlerts`
  - `estimateDomainValue`
- [ ] **Intent detection**: before calling tools, classify the user's intent (query vs. mutation vs. explanation) to decide whether to use tools or just answer
- [ ] **Confirmation before mutations**: AI should always confirm destructive actions in chat before executing ("I'll delete the MX record for example.com — proceed?")
- [ ] **Error recovery in tool calls**: if a tool fails, the AI should explain what went wrong and suggest fixes instead of showing a raw error
- [ ] **Suggested actions**: after answering a query, suggest related follow-ups ("I see example.com expires in 12 days — want me to set up a renewal reminder?")
- [ ] **Domain valuation**: use AI + historical sales data APIs (NameBio, EstiBot) to estimate domain values for the portfolio view
- [ ] **Natural language bulk operations**: "Update TTL to 300 for all A records across my portfolio" → AI generates the plan, shows it, asks for approval, executes

---

## 7. Notifications & Alerting

- [ ] **Email notifications** (via Resend, SendGrid, or Cloudflare Email Workers):
  - Domain expiry reminders (30/14/7/1 days)
  - SSL expiry reminders
  - Drift detection alerts (external DNS change)
  - Weekly digest email
- [ ] **Slack integration**: webhook-based notifications to a Slack channel
- [ ] **Discord integration**: webhook-based notifications
- [ ] **Custom webhook support**: POST to any URL on events
- [ ] **In-app notification center**: unread count badge, notification feed in the sidebar
- [ ] **Alert rules engine**: let users configure custom alert rules:
  - "Alert me if any domain expires within 60 days" (custom threshold)
  - "Alert me if any TXT record changes on example.com"
  - "Weekly summary every Monday at 9am"
- [ ] **Cron-based scheduled checks** (Cloudflare Cron Triggers):
  - Daily: domain expiry check, SSL check
  - Hourly: drift detection for connected providers
  - Weekly: digest generation

---

## 8. Frontend Improvements

### Chat Experience
- [ ] Make the chat panel a **persistent sidebar or overlay** accessible from every page (not a separate page)
- [ ] Streaming response rendering (tokens appear as they arrive)
- [ ] Show tool-call activity inline in chat ("Checking DNS records for example.com..." with a spinner)
- [ ] Render structured data in chat (tables for DNS records, cards for domain info)
- [ ] Quick-action buttons in AI responses ("Approve", "View details", "Undo")
- [ ] Chat history: persist and load previous conversations
- [ ] Suggested prompts for new users ("Try: 'Add domain example.com'" / "Show me expiring domains")

### Dashboard
- [ ] Real-time stats from Postgres (not just Durable Object state)
- [ ] Portfolio value card (total estimated value of all domains)
- [ ] Provider breakdown chart (pie chart: X domains on Cloudflare, Y on GoDaddy, etc.)
- [ ] Security score (% of domains with DMARC, SPF, DKIM, CAA, DNSSEC)
- [ ] Upcoming renewals calendar view

### Domains Page
- [ ] Bulk selection + bulk actions (delete, change status, move to folder, sync)
- [ ] Column sorting and advanced filtering (by registrar, status, expiry range, provider, tags)
- [ ] Tags and folders for organization
- [ ] Inline quick-edit (click a cell to edit registrar, notes, etc.)
- [ ] Domain detail page: full info, DNS records, change history, health report, WHOIS, SSL — all in one view
- [ ] Import domains: CSV upload, bulk text paste, or auto-import from connected providers

### DNS Page
- [ ] Visual DNS record editor with validation (e.g., MX must have priority, CNAME can't coexist with other records at same name)
- [ ] "Propagation check" button after changes
- [ ] Side-by-side diff view for record changes
- [ ] Record templates: "Set up Google Workspace email" → pre-fills MX + SPF + DKIM records

### Settings Page
- [ ] **Provider connections**: connect Cloudflare, GoDaddy, Namecheap, Route53 with API keys
- [ ] **Notification preferences**: email, Slack, Discord, webhooks, per-alert-type toggles
- [ ] **API key management**: generate personal API keys for external integrations
- [ ] **Data export**: export all domains, DNS records, history as CSV/JSON
- [ ] **Account danger zone**: delete account, export & leave

### New Pages
- [ ] **Domain Detail Page** (`/app/domains/:id`): single domain deep-dive with tabs (overview, DNS, history, health, WHOIS, SSL)
- [ ] **Provider Connections Page** (`/app/settings/providers`): manage connected DNS/registrar accounts
- [ ] **Portfolio Analytics Page**: charts for domain value over time, renewal cost forecast, registrar distribution

---

## 9. API & Integrations

- [ ] **Public REST API** for external tools:
  - `GET /api/v1/domains` — list domains
  - `GET /api/v1/domains/:id/records` — list DNS records
  - `POST /api/v1/domains` — add domain
  - `POST /api/v1/domains/:id/records` — add DNS record
  - `GET /api/v1/health/:domain` — health check
  - API key auth (not just Firebase tokens)
- [ ] **Terraform provider**: let users manage DomainPilot resources via Terraform
- [ ] **GitHub Action**: "DNS lint" — check DNS config in CI/CD
- [ ] **Zapier / Make integration**: trigger workflows on domain events
- [ ] **DNS-as-Code**: export/import DNS config as YAML/JSON files, version in Git
  - AI can generate the config from natural language
  - `domainpilot export example.com > example.com.dns.yaml`
  - `domainpilot apply example.com.dns.yaml`

---

## 10. Security & Infrastructure

- [ ] **Encrypt stored API keys** at rest (AES-256-GCM with a key from Cloudflare secrets)
- [ ] **Rate limiting** on all API endpoints (per-user, per-IP)
- [ ] **Audit log** for all mutations (who did what, when, from which IP)
- [ ] **Role-based access control (RBAC)** for teams:
  - Owner: full access
  - Admin: manage domains + DNS, can't delete account
  - Member: view + propose changes (approval required)
  - Viewer: read-only
- [ ] **Team / organization support**: shared domain portfolios with multiple members
- [ ] **Two-factor confirmation** for dangerous operations (delete domain, remove provider, bulk delete)
- [ ] **Content Security Policy** headers on frontend
- [ ] **CORS hardening**: replace wildcard `*.vercel.app` with specific deployed URL
- [ ] Proper error pages (404, 500) instead of raw "Not Found" text
- [ ] Request logging and structured observability (already have `observability: { enabled: true }` in wrangler)

---

## 11. Billing & Monetization

Current: single $10/month plan. Needs tiering for different user segments.

- [ ] **Free tier**: up to 5 domains, manual management only, no provider connections, basic alerts
- [ ] **Pro tier ($10/month)**: unlimited domains, AI chat, 2 provider connections, all alerts
- [ ] **Team tier ($25/month)**: everything in Pro + 5 seats, RBAC, shared portfolios, priority support
- [ ] **Enterprise (custom)**: SSO, unlimited seats, SLA, dedicated support, custom integrations
- [ ] Gate features based on plan in both backend (check subscription before tool execution) and frontend (show upgrade prompts)
- [ ] Usage tracking: count AI chat messages, provider syncs, API calls per billing period
- [ ] Stripe Customer Portal integration for plan changes, cancellations, invoice history (partially done)
- [ ] Annual billing discount option

---

## 12. Testing & Quality

- [ ] **Backend unit tests**: expand beyond current basic tests
  - Test every tool execution path
  - Test Postgres queries (use a test database or mock)
  - Test provider integrations with mocked API responses
  - Test AI tool-calling loop with mocked LLM responses
- [ ] **Frontend tests**: add React Testing Library tests for key flows
  - Add domain flow
  - Edit domain flow
  - Chat interaction
  - Dashboard data loading
- [ ] **E2E tests**: Playwright tests for critical user journeys
  - Sign up → add domain → configure DNS → check health
  - Connect provider → sync → view unified dashboard
- [ ] **CI/CD pipeline**: GitHub Actions for lint, typecheck, test, deploy
- [ ] **Staging environment**: separate Cloudflare worker + Vercel preview for testing

---

## 13. Performance & Scalability

- [ ] **Database indexing**: add proper indexes for all frequent query patterns (user_id + domain, domain_id + record_type, etc.)
- [ ] **Query optimization**: paginate all list endpoints, add cursor-based pagination for large portfolios
- [ ] **Caching layer**: cache provider API responses (Cloudflare KV or in-memory) to reduce API calls
- [ ] **Background job queue**: use Cloudflare Queues for async operations (provider sync, WHOIS lookups, SSL checks) instead of blocking request handlers
- [ ] **CDN for frontend assets**: already on Vercel, but ensure proper cache headers
- [ ] **Database connection pooling**: use Neon's pooler endpoint (already in the URL) and connection limits

---

## 14. Polish & Launch Readiness

- [ ] **Onboarding flow**: guided first-run experience (add first domain, connect a provider, try the chat)
- [ ] **Empty states**: meaningful illustrations and CTAs on every page when there's no data
- [ ] **Loading skeletons**: replace spinners with skeleton placeholders
- [ ] **Mobile responsiveness**: test and fix the layout on mobile (sidebar collapse, responsive tables)
- [ ] **Dark/light mode**: currently dark-only; add theme toggle
- [ ] **Keyboard shortcuts**: Cmd+K for chat, Cmd+N for new domain, etc.
- [ ] **SEO for landing page**: proper meta tags, Open Graph, structured data
- [ ] **Legal pages**: Terms of Service, Privacy Policy (required before handling user DNS data)
- [ ] **Documentation site**: how-to guides, API reference, provider setup guides
- [ ] **Changelog**: public changelog page for updates
- [ ] **Feedback widget**: in-app feedback collection (Canny, or custom)

---

## Priority Order (Suggested)

1. **Postgres migration** (#0) — everything depends on persistent, shared data
2. **AI tool-calling** (#1) — this is the product's core differentiator
3. **AI database access** (#1) — let the AI query user data to answer questions
4. **Chat streaming + history** (#1, #8) — make the chat feel real
5. **Cloudflare DNS provider** (#2) — first real provider integration, proves the concept
6. **WHOIS + SSL monitoring** (#3) — high-value, relatively easy to implement
7. **Notifications** (#7) — email alerts for expiry (highest-requested feature in domain tools)
8. **Cross-provider intelligence** (#4) — the long-term moat
9. **Frontend polish** (#8, #14) — make it feel production-grade
10. **Additional providers** (#2) — GoDaddy, Namecheap, Route53
11. **Billing tiers** (#11) — monetize properly
12. **Team features** (#10) — expand to organizations
13. **Public API + integrations** (#9) — platform play
