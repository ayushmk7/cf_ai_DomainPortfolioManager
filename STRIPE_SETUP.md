# Stripe setup and env configuration

## Backend (Cloudflare Worker)

Set these in **Wrangler** — either in `wrangler.jsonc` under `vars` (non-secret) or via secrets (recommended for keys):

```bash
cd backend
npx wrangler secret put STRIPE_SECRET_KEY   # sk_test_... or sk_live_...
npx wrangler secret put STRIPE_WEBHOOK_SECRET   # whsec_... from Stripe Dashboard → Webhooks
```

In `wrangler.jsonc` you can add (for non-secret values):

```json
{
  "vars": {
    "STRIPE_PRICE_ID": "price_xxxxxxxxxxxxx"
  }
}
```

Or set the price ID as a secret:

```bash
npx wrangler secret put STRIPE_PRICE_ID
```

### What each variable is

| Variable | Where to get it | Required |
|----------|------------------|----------|
| **STRIPE_SECRET_KEY** | Stripe Dashboard → Developers → API keys → Secret key | Yes (for checkout/portal) |
| **STRIPE_PRICE_ID** | Stripe Dashboard → Products → your $10/mo product → Price ID (starts with `price_`) | Yes (for checkout) |
| **STRIPE_WEBHOOK_SECRET** | Stripe Dashboard → Developers → Webhooks → Add endpoint → Signing secret | Yes in production (verifies webhooks) |

### Webhook endpoint

1. In Stripe Dashboard → Developers → Webhooks → **Add endpoint**.
2. **Endpoint URL:** `https://<your-worker>.workers.dev/webhooks/stripe`
3. **Events to send:**  
   - `checkout.session.completed`  
   - `customer.subscription.updated`  
   - `customer.subscription.deleted`  
   - `invoice.paid`
4. Copy the **Signing secret** (`whsec_...`) and set it as `STRIPE_WEBHOOK_SECRET` (see above).

### Database

Billing uses the same Postgres as the rest of the app (`DATABASE_URL` or Hyperdrive). Ensure migrations have been run so the `users` and `subscriptions` tables exist. When a user subscribes, we create/update `users` (from Firebase UID + email) and `subscriptions` (from Stripe webhooks).

---

## Frontend (.env)

**No Stripe keys go in the frontend.** Stripe is used only on the backend.

Your `frontend/.env` should look like this (see `frontend/.env.example`):

```env
# Backend API (required for checkout and subscription status)
VITE_API_URL=http://localhost:8787

# Firebase (required for Settings billing: user must be signed in)
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

- **VITE_API_URL** — In dev this is usually `http://localhost:8787` (where `wrangler dev` runs). In production, use your Worker URL (e.g. `https://domain-pilot.workers.dev`).
- **Firebase** — Needed so users can sign in; the backend uses the Firebase ID token to identify the user for `/subscription` and for creating checkout sessions.

---

## Quick checklist

1. **Stripe Dashboard:** Create a Product with a recurring Price ($10/month), copy the **Price ID** (`price_...`).
2. **Backend:** Set `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, and `STRIPE_WEBHOOK_SECRET` (and optionally `DATABASE_URL` for Postgres).
3. **Stripe Webhooks:** Add endpoint `https://<worker>/webhooks/stripe` and subscribe the events above; set the signing secret as `STRIPE_WEBHOOK_SECRET`.
4. **Frontend:** Set `VITE_API_URL` and Firebase env vars in `.env` (no Stripe keys).
5. **Payment flow:** User goes to **Settings → Billing**, clicks **Subscribe — $10/month**, completes Stripe Checkout; after payment they can use **Manage billing** for the Stripe Customer Portal.
