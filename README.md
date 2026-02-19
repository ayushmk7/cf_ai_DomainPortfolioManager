# Domain Portfolio Manager

Monorepo: **frontend** (React, Vercel) and **backend** (Cloudflare Worker).

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

   - Frontend: http://localhost:5173  
   - Backend: http://localhost:8787  

   Or run separately:

   - `npm run dev:frontend` — Vite dev server  
   - `npm run dev:backend` — Wrangler dev  

3. Build and test:

   - `npm run build` — build frontend and typecheck backend  
   - `npm run test` — run backend tests  

## Deployment

- **Frontend (Vercel)**  
  - Connect the repo to Vercel and set **Root Directory** to `frontend`.  
  - Add env var: `VITE_API_URL` = your backend URL (e.g. `https://domain-pilot.<account>.workers.dev`).  

- **Backend (Cloudflare)**  
  - From project root: `cd backend && npm run deploy`  
  - Or use your CI with Wrangler.  
  - Required bindings: AI, DOMAIN_PILOT_AGENT, VECTORIZE, DOMAIN_ONBOARDING_WORKFLOW, BULK_DNS_UPDATE_WORKFLOW (see `backend/README.md`).  

## Backend details

See [backend/README.md](backend/README.md) for Cloudflare bindings, Vectorize setup, and local worker usage.
