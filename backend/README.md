DomainPilot Backend

Cloudflare Workers backend for DomainPilot.

Implemented backend modules

- src/index.ts: Worker entrypoint and agent routing.
- src/agent/DomainPilotAgent.ts: Durable Object agent core, tool execution, approvals, scheduling callbacks, health checks. All domain/DNS/alert data is read from Postgres via src/agent/db-pg.ts when DATABASE_URL is set.
- src/agent/db-pg.ts: Postgres-backed data layer for the agent (scoped by user and org).
- src/agent/db.ts: Legacy SQLite helpers for development without Postgres (deprecated; production requires Postgres).
- src/agent/tools.ts: LLM tool definitions and validation contracts.
- src/workflows: onboarding and bulk DNS workflow classes.
- src/utils: domain, DNS, and date validation helpers.

Local setup

- Install dependencies: npm install (or from repo root: npm install)
- Typecheck: npm run typecheck
- Run tests: npm test
- Start local worker: npm run dev

First-time deploy (workers.dev subdomain)

- Before your first deploy, you must claim a workers.dev subdomain. In the
  Cloudflare Dashboard go to Workers & Pages → Workers and open the Workers
  landing page; Cloudflare will prompt you to create a subdomain (e.g.
  yourname.workers.dev). After that, npm run deploy will succeed.

Per-user and org data (domains, DNS, history)

- Each signed-in user has their own isolated data. The backend uses the Firebase id token (sent as Authorization: Bearer &lt;token&gt;) to resolve the user id and routes requests to that user’s Durable Object. When Postgres is configured, domains, DNS, history, and alerts are stored in Postgres and scoped by user; the agent and REST APIs use this data. Production uses Postgres only for domain data (no Durable Object SQLite).
- For per-user isolation set FIREBASE_WEB_API_KEY (Firebase project → Project settings → General → Web API Key). Set it as a Wrangler secret: npx wrangler secret put FIREBASE_WEB_API_KEY
- If FIREBASE_WEB_API_KEY is not set, all unauthenticated traffic is treated as a single “anonymous” user . /app and /agent require login when Postgres is configured; unauthenticated requests receive 401.

Database and migrations

- Set DATABASE_URL (or HYPERDRIVE) as a Wrangler secret in production; do not put the connection string in wrangler.jsonc. Example: npx wrangler secret put DATABASE_URL
- Migrations run automatically on the first request (e.g. /health). Schema is tracked in schema_migrations. Migrations 001–002: users, domain data. 003: organizations, org_memberships, clients, provider_connections, whois_cache, ssl_checks, sync_logs, org columns. 004: org_invitations. 005: notifications. SQL is in backend/src/db/pg.ts (mirrors backend/migrations/*.sql).

Optional environment variables

- OPENAI_API_KEY: When set, the chat uses OpenAI (gpt-4o-mini) instead of
  Workers AI / Llama. Set it as a Wrangler secret:
  npx wrangler secret put OPENAI_API_KEY
- FIREBASE_WEB_API_KEY: Required for per-user auth (see above).
- DATABASE_URL (or HYPERDRIVE): When set, domains, DNS, history, and alerts are stored in Postgres and scoped by user. Required for production. Set as a Wrangler secret.
- ENCRYPTION_KEY: 32-byte hex (64 chars) or base64 for AES-256-GCM; encrypts provider credentials at rest. Set as a Wrangler secret for production.
- WHOIS_API_KEY: WhoisXMLAPI key for WHOIS lookups (whoisserver/WhoisService). When set, WHOIS data is fetched and cached.

Required Cloudflare bindings

- AI (Workers AI)
- DOMAIN_PILOT_AGENT (Durable Object)
- VECTORIZE (domain-history-index)
- DOMAIN_ONBOARDING_WORKFLOW (Workflow binding)
- BULK_DNS_UPDATE_WORKFLOW (Workflow binding)

All configured in wrangler.jsonc.

Vectorize and local dev

- Vectorize has no local simulator; wrangler dev shows it as not supported by default.
- The Vectorize binding in wrangler.jsonc uses remote: true so npm run dev talks to your real Cloudflare index.
- Create the index once: npx wrangler vectorize create domain-history-index --dimensions 768 --metric cosine
- Without that index, semantic search in dev will fall back to SQL-only history (code already handles missing Vectorize).
