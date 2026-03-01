# Domain Portfolio Manager

Monorepo: **frontend** (React, Vercel) and **backend** (Cloudflare Worker). AI-powered domain and DNS management with chat, tool-calling, and Cloudflare primitives.

---

## How this app fulfills the AI-powered application criteria (Cloudflare assignment)

This project is an AI-powered application on Cloudflare. Here is how each required component is implemented:

| Component | Requirement | How we do it |
|-----------|-------------|--------------|
| **LLM** | Use Llama 3.3 on Workers AI, or an external LLM | **Workers AI (Llama 3.3):** When `OPENAI_API_KEY` is not set, the chat agent uses Workers AI with `@cf/meta/llama-3.3-70b-instruct-fp8-fast` via the Vercel AI SDK (`streamText` + `workers-ai-provider`) in `backend/src/agent/DomainPilotAgent.ts`. **External LLM (optional):** When `OPENAI_API_KEY` is set, the agent uses OpenAI `gpt-4o-mini` with full tool-calling (add domain, DNS, query, approvals). |
| **Workflow / coordination** | Use Workflows, Workers, or Durable Objects | **Worker** (`backend/src/index.ts`): Entrypoint; routes HTTP (e.g. `/health`, `/agent`, `/domains`, `/history`), resolves auth, and forwards `/agent` to the Durable Object. **Durable Object** (`DomainPilotAgent`): One DO per user (by Firebase UID); handles chat, tool execution, in-memory approval state, and triggers Workflows. **Workflows:** `DomainOnboardingWorkflow` (domain onboarding) and `BulkDnsUpdateWorkflow` (bulk DNS updates) are invoked by the agent when the user adds a domain or runs a bulk update. Configured in `backend/wrangler.jsonc` (bindings: `DOMAIN_PILOT_AGENT`, `DOMAIN_ONBOARDING_WORKFLOW`, `BULK_DNS_UPDATE_WORKFLOW`). |
| **User input via chat (or voice)** | Use Pages or Realtime for chat/voice | **Chat:** The frontend is a React app (Vite) deployed to Vercel (or run locally). The Chat UI at `/app/chat` (`frontend/src/app/pages/ChatPage.tsx`) sends user messages to the backend via `POST /agent` with `action: "chat"` and the conversation history. The Worker receives the request and forwards it to the user’s Durable Object stub; the agent returns the LLM response (and optional tool results). No Realtime/voice in this repo; the assignment’s “chat or voice” is satisfied by the **chat** path. |
| **Memory or state** | Persist state for the AI app | **Durable Object state:** The agent stores in-DO state (e.g. `agent_state`: domain count, expiring soon, pending approvals, recent changes) in `state.storage` and keeps in-memory approval callbacks. **Postgres (Neon):** All domain, DNS, history, and alert data is persisted in Postgres (migrations 001–005), scoped by user and org. The agent reads/writes via `backend/src/agent/db-pg.ts`. **Vectorize:** Semantic search over DNS change history uses the `domain-history-index` Vectorize index (optional; falls back to SQL if not configured). |

**Summary:** The Worker routes requests; the Durable Object runs the LLM (Workers AI or OpenAI), executes tools, and coordinates Workflows; the frontend provides the chat interface; and state lives in the Durable Object, Postgres, and (optionally) Vectorize.

---

## Structure

- **frontend/** — React app (Vite, Tailwind). Deploy to Vercel.
- **backend/** — Cloudflare Worker (Durable Objects, Workflows, Vectorize). Deploy with Wrangler.

## Local development

1. Install dependencies (from repo root):
  ```bash
   npm install
  ```
2. Run both apps:
  ```bash
   npm run dev
  ```
  - Frontend: [http://localhost:5173](http://localhost:5173)  
  - Backend: [http://localhost:8787](http://localhost:8787)
   Or run separately:
  - `npm run dev:frontend` — Vite dev server  
  - `npm run dev:backend` — Wrangler dev
3. Build and test:
  - `npm run build` — build frontend and typecheck backend  
  - `npm run test` — run backend tests

## Deployment

### Frontend (Vercel)

This repo is already set up for Vercel: root `vercel.json` builds the frontend (`npm run build -w domain-pilot-frontend`) and serves from `frontend/dist`. No need to set Root Directory to `frontend`; deploy from the **repo root**.

**Connect GitHub so every push deploys:**

1. Go to [vercel.com](https://vercel.com) and open your project **domain-portfolio-manager** (or create one).
2. **Settings → Git** → Connect to **ayushmk7/cf_ai_DomainPortfolioManager** (or your fork).  
   - If you deployed via CLI first, use "Connect Git Repository" and select the repo.  
   - Branch: `main` (or your default). Every push to that branch will trigger a deploy.
3. **Settings → General** → ensure **Root Directory** is empty (deploy from root; `vercel.json` defines build/output).

**Optional env:** In Vercel → **Settings → Environment Variables**, add `VITE_API_URL` if you later connect a backend (e.g. `https://your-worker.workers.dev`).

**Custom domain (your own link):**

1. In Vercel: open the project → **Settings → Domains**.
2. Click **Add** and enter your domain (e.g. `domainpilot.app` or `app.yoursite.com`).
3. Vercel will show DNS records. Either:
   - **Vercel DNS:** Add the nameservers it gives you at your registrar (e.g. Namecheap, GoDaddy) so Vercel manages DNS, or  
   - **CNAME:** Add a CNAME record: name = `www` (or subdomain you want), value = `cname.vercel-dns.com`. For apex (e.g. `domainpilot.app`), use the A record Vercel shows.
4. Wait for DNS to propagate (minutes to 48 hours). Vercel will auto-issue SSL.

Your app will then be live at your custom URL (e.g. `https://domainpilot.app`). Free Vercel accounts get one free custom domain per project.

- **Backend (Cloudflare)**  
  - From project root: `cd backend && npm run deploy`  
  - Or use your CI with Wrangler.  
  - Required bindings: AI, DOMAIN_PILOT_AGENT, VECTORIZE, DOMAIN_ONBOARDING_WORKFLOW, BULK_DNS_UPDATE_WORKFLOW (see `backend/README.md`).

## Backend details

See [backend/README.md](backend/README.md) for Cloudflare bindings, Vectorize setup, and local worker usage.

## Chat and tool-calling

For full chatbot tool use (add domain, change DNS, query domains, etc.) set **OPENAI_API_KEY** as a Wrangler secret: `cd backend && npx wrangler secret put OPENAI_API_KEY`. Without it, chat uses Workers AI (Llama) and is **text-only** (no tools). See [backend/README.md](backend/README.md) for details.

## Environment and secrets

- **Backend** (local: `backend/.dev.vars`; production: Wrangler secrets): **DATABASE_URL**, **FIREBASE_WEB_API_KEY**; optional: **OPENAI_API_KEY** (for chat tools), **ENCRYPTION_KEY** (provider credentials), **WHOIS_API_KEY** (WHOIS lookups). See [backend/README.md](backend/README.md).
- **Frontend**: `.env` with Firebase vars and **VITE_API_URL** (backend URL in production). See `frontend/.env.example`.

**Everything-works checklist:**

- `npm install`, `npm run build`, `npm run test` pass.
- `npm run dev` → frontend at :5173, backend at :8787; `GET http://localhost:8787/health` returns `{ "ok": true, "service": "domain-pilot-backend", "db": "ok" }` (or `"db": "unavailable"` without DATABASE_URL).
- Backend secrets (local: `.dev.vars`): `DATABASE_URL`, `FIREBASE_WEB_API_KEY`; optional: `OPENAI_API_KEY`.
- Frontend `.env`: Firebase vars and `VITE_API_URL` for production.
- Sign in → Dashboard, Domains, Chat, History, Alerts load; chat with OpenAI can run tools (e.g. “add domain example.com”).

