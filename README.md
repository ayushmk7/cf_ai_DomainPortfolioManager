DomainPilot Backend

Cloudflare Workers backend for DomainPilot (backend-only implementation).

Implemented backend modules

- src/index.ts: Worker entrypoint and agent routing.
- src/agent/DomainPilotAgent.ts: Durable Object agent core, tool execution, approvals, scheduling callbacks, health checks.
- src/agent/db.ts: SQLite schema and query helpers.
- src/agent/tools.ts: LLM tool definitions and validation contracts.
- src/workflows: onboarding and bulk DNS workflow classes.
- src/utils: domain, DNS, and date validation helpers.

Local setup

- Install dependencies: npm install
- Typecheck: npm run typecheck
- Run tests: npm test
- Start local worker: npm run dev

Required Cloudflare bindings

- AI (Workers AI)
- DOMAIN_PILOT_AGENT (Durable Object)
- VECTORIZE (domain-history-index)
- DOMAIN_ONBOARDING_WORKFLOW (Workflow binding)
- BULK_DNS_UPDATE_WORKFLOW (Workflow binding)

All configured in wrangler.jsonc.
