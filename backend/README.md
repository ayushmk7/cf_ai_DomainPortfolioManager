DomainPilot Backend

Cloudflare Workers backend for DomainPilot.

Implemented backend modules

- src/index.ts: Worker entrypoint and agent routing.
- src/agent/DomainPilotAgent.ts: Durable Object agent core, tool execution, approvals, scheduling callbacks, health checks.
- src/agent/db.ts: SQLite schema and query helpers.
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

Per-user data (domains, DNS, history)

- Each signed-in user has their own isolated data. The backend uses the Firebase id token (sent as Authorization: Bearer &lt;token&gt;) to resolve the user id and routes requests to that user’s Durable Object. Domains and DNS are stored per user inside the Durable Object (SQLite), not in Postgres.
- For per-user isolation to work you must set FIREBASE_WEB_API_KEY (Firebase project → Project settings → General → Web API Key). Set it as a Wrangler secret: npx wrangler secret put FIREBASE_WEB_API_KEY
- If FIREBASE_WEB_API_KEY is not set, all unauthenticated traffic is treated as a single “anonymous” user and shares one DB.

Optional environment variables

- OPENAI_API_KEY: When set, the chat uses OpenAI (gpt-4o-mini) instead of
  Workers AI / Llama. Set it as a Wrangler secret:
  npx wrangler secret put OPENAI_API_KEY
- FIREBASE_WEB_API_KEY: Required for per-user auth (see above).
- DATABASE_URL (or HYPERDRIVE): Optional. Postgres is used only for users and Stripe subscriptions (billing), not for domains or DNS. You only need Postgres if you use Stripe subscription features. No Postgres API key is required for domain/DNS storage.

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
