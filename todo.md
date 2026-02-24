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

## What’s Left for a Functional Website

Four critical gaps block a minimal working product:

| Gap | Description |
|-----|-------------|
| **1. Persistent data** | Domain/DNS/alert data lives in Durable Object SQLite (ephemeral, lost on redeploy). It must live in Postgres (Neon), scoped per user (then per org in Phase 2). |
| **2. Auth protection** | `/app` must require sign-in; every request to the backend must send the Firebase ID token so the backend uses the correct user. |
| **3. Tool-calling AI** | Chat currently does not pass tools to the LLM. The AI must run the tool-calling loop (send tools, parse tool_calls, execute, feed results back) so it can add domains, change DNS, etc. |
| **4. Frontend real data** | Dashboard, Domains, DNS, History, Alerts, and Chat must load and display data from the backend (Postgres or agent) and send the auth token. |

**Recommended order of work:** Postgres → Auth → Tool-calling → Frontend.

---

## Three Implementation Phases

Work is split into three phases. Each phase has its own detailed checklist.

| Phase | Focus | Details |
|-------|--------|---------|
| **Phase 1 — Functional website** | Single user, Postgres as source of truth, auth, tool-calling, frontend wired to real data. | [docs/TODO-PHASE-1.md](docs/TODO-PHASE-1.md) |
| **Phase 2 — Multi-tenant product** | Orgs, teams, RBAC, clients; real DNS providers (Cloudflare first); WHOIS/SSL; notifications; schema expansion. | [docs/TODO-PHASE-2.md](docs/TODO-PHASE-2.md) |
| **Phase 3 — Agency/enterprise** | Cross-provider intelligence, full agency UI, security/compliance, public API, billing, testing/performance/polish. | [docs/TODO-PHASE-3.md](docs/TODO-PHASE-3.md) |

Start with Phase 1 and complete it fully before moving on.
