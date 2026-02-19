import { DomainPilotAgent } from "./agent/DomainPilotAgent";
import { BulkDnsUpdateWorkflow } from "./workflows/BulkDnsUpdateWorkflow";
import { DomainOnboardingWorkflow } from "./workflows/DomainOnboardingWorkflow";
import { createCheckoutSession, createPortalSession, handleStripeWebhook } from "./stripe";
import { getSubscription, getUserByFirebaseUid, upsertUser } from "./db/pg";
import type { Env } from "./types";

export { DomainPilotAgent, DomainOnboardingWorkflow, BulkDnsUpdateWorkflow };

const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:3000",
];

function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin");
  const allowOrigin =
    origin && (ALLOWED_ORIGINS.includes(origin) || origin.endsWith(".vercel.app"))
      ? origin
      : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

function withCors(response: Response, request: Request): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(getCorsHeaders(request))) {
    headers.set(k, v);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function resolveUserId(request: Request, env: Env): Promise<string> {
  const url = new URL(request.url);
  const nameParam = url.searchParams.get("name");

  const authHeader = request.headers.get("Authorization");
  const apiKey = env.FIREBASE_WEB_API_KEY;
  if (authHeader?.startsWith("Bearer ") && apiKey) {
    const token = authHeader.slice(7);
    try {
      const res = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken: token }),
        },
      );
      if (res.ok) {
        const data = (await res.json()) as { users?: { localId: string }[] };
        if (data.users?.[0]?.localId) {
          return data.users[0].localId;
        }
      }
    } catch {
      // Fall through to anonymous / name param
    }
  }

  return nameParam ?? "anonymous";
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: getCorsHeaders(request),
      });
    }

    const url = new URL(request.url);
    if (url.pathname === "/health") {
      const res = Response.json({ ok: true, service: "domain-pilot-backend" });
      return withCors(res, request);
    }

    if (url.pathname === "/create-checkout-session" && request.method === "POST" && env.STRIPE_SECRET_KEY) {
      const body = (await request.json()) as {
        userId: string;
        customerEmail?: string;
        successUrl: string;
        cancelUrl: string;
      };
      // Resolve Firebase UID to DB user id so Stripe client_reference_id = users.id
      let user = await getUserByFirebaseUid(env, body.userId);
      if (!user && body.customerEmail) {
        await upsertUser(env, body.userId, body.customerEmail, null);
        user = await getUserByFirebaseUid(env, body.userId);
      }
      const dbUserId = user?.id ?? body.userId;
      const result = await createCheckoutSession(
        env,
        dbUserId,
        body.successUrl,
        body.cancelUrl,
        body.customerEmail,
      );
      return withCors(Response.json(result), request);
    }

    if (url.pathname === "/create-portal-session" && request.method === "POST" && env.STRIPE_SECRET_KEY) {
      const body = (await request.json()) as { stripeCustomerId: string; returnUrl: string };
      const result = await createPortalSession(env, body.stripeCustomerId, body.returnUrl);
      return withCors(Response.json(result), request);
    }

    if (url.pathname === "/subscription" && request.method === "GET") {
      const userId = await resolveUserId(request, env);
      if (!userId || userId === "anonymous") {
        return withCors(Response.json({ error: "Unauthorized" }, { status: 401 }), request);
      }
      const user = await getUserByFirebaseUid(env, userId);
      if (!user) {
        return withCors(Response.json({ subscription: null }), request);
      }
      const subscription = await getSubscription(env, user.id);
      return withCors(
        Response.json({ subscription: subscription ? { plan: subscription.plan, status: subscription.status, stripeCustomerId: subscription.stripe_customer_id, currentPeriodEnd: subscription.current_period_end } : null }),
        request,
      );
    }

    if (url.pathname === "/webhooks/stripe" && request.method === "POST") {
      const rawBody = await request.text();
      const sig = request.headers.get("stripe-signature") ?? "";
      const result = await handleStripeWebhook(env, rawBody, sig);
      const status = result.status ?? (result.ok ? 200 : 500);
      return withCors(Response.json({ ok: result.ok }, { status }), request);
    }

    if (url.pathname.startsWith("/agent")) {
      const userId = await resolveUserId(request, env);
      const id = env.DOMAIN_PILOT_AGENT.idFromName(userId);
      const stub = env.DOMAIN_PILOT_AGENT.get(id);
      const response = await stub.fetch(request);
      return withCors(response, request);
    }

    const notFound = new Response("Not Found", { status: 404 });
    return withCors(notFound, request);
  },
};
