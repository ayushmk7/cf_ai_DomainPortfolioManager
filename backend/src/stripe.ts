/**
 * Stripe integration: checkout sessions, customer portal, and webhook handling.
 * Uses Stripe REST API directly (no SDK needed on Workers).
 */

import type { Env } from "./types";
import { upsertSubscription } from "./db/pg";

const STRIPE_API = "https://api.stripe.com/v1";

async function stripeRequest(
  env: Env,
  path: string,
  body: Record<string, string>,
  method = "POST",
): Promise<Record<string, unknown>> {
  const res = await fetch(`${STRIPE_API}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${btoa(env.STRIPE_SECRET_KEY + ":")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body).toString(),
  });
  return (await res.json()) as Record<string, unknown>;
}

function bytesToHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Verify Stripe webhook signature using STRIPE_WEBHOOK_SECRET. */
async function verifyStripeSignature(
  env: Env,
  payload: string,
  signatureHeader: string,
): Promise<boolean> {
  const secret = env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return true; // skip verification if not configured (e.g. dev)

  const parts = signatureHeader.split(",").reduce(
    (acc, part) => {
      const [k, v] = part.split("=");
      if (k && v) acc[k.trim()] = v.trim();
      return acc;
    },
    {} as Record<string, string>,
  );
  const timestamp = parts["t"];
  const expectedSig = parts["v1"];
  if (!timestamp || !expectedSig) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signedPayload),
  );
  const computedHex = bytesToHex(sig);
  return computedHex === expectedSig;
}

export async function createCheckoutSession(
  env: Env,
  userId: string,
  successUrl: string,
  cancelUrl: string,
  customerEmail?: string,
): Promise<{ url: string }> {
  const body: Record<string, string> = {
    mode: "subscription",
    "line_items[0][price]": env.STRIPE_PRICE_ID ?? "",
    "line_items[0][quantity]": "1",
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: userId,
    "subscription_data[metadata][user_id]": userId,
  };
  if (customerEmail) {
    body.customer_email = customerEmail;
  }
  const session = await stripeRequest(env, "/checkout/sessions", body);
  const url = session.url as string;
  if (!url && (session as { error?: { message?: string } }).error) {
    throw new Error((session as { error: { message: string } }).error.message);
  }
  return { url };
}

export async function createPortalSession(
  env: Env,
  stripeCustomerId: string,
  returnUrl: string,
): Promise<{ url: string }> {
  const session = await stripeRequest(env, "/billing_portal/sessions", {
    customer: stripeCustomerId,
    return_url: returnUrl,
  });
  return { url: session.url as string };
}

async function getSubscriptionPeriodEnd(
  env: Env,
  subscriptionId: string,
): Promise<string | null> {
  const res = await fetch(`${STRIPE_API}/subscriptions/${subscriptionId}`, {
    method: "GET",
    headers: {
      Authorization: `Basic ${btoa(env.STRIPE_SECRET_KEY + ":")}`,
    },
  });
  const sub = (await res.json()) as Record<string, unknown>;
  const end = sub.current_period_end as number | undefined;
  return end ? new Date(end * 1000).toISOString() : null;
}

export async function handleStripeWebhook(
  env: Env,
  body: string,
  signature: string,
): Promise<{ ok: boolean; status?: number }> {
  if (env.STRIPE_WEBHOOK_SECRET) {
    const valid = await verifyStripeSignature(env, body, signature);
    if (!valid) return { ok: false, status: 401 };
  }

  const event = JSON.parse(body) as {
    type: string;
    data: { object: Record<string, unknown> };
  };

  // New subscription from Checkout: create subscription record with userId from client_reference_id
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as {
      client_reference_id?: string;
      customer?: string;
      subscription?: string;
    };
    const userId = session.client_reference_id;
    const customerId = session.customer;
    const subscriptionId = session.subscription;
    if (userId && customerId && subscriptionId) {
      const periodEnd = await getSubscriptionPeriodEnd(env, subscriptionId);
      await upsertSubscription(
        env,
        userId,
        customerId,
        subscriptionId,
        "pro",
        "active",
        periodEnd,
      );
    }
  }

  if (
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted" ||
    event.type === "invoice.paid"
  ) {
    const sub = event.data.object;
    const userId = (sub.metadata as Record<string, string>)?.user_id;
    if (userId) {
      await upsertSubscription(
        env,
        userId,
        sub.customer as string,
        sub.id as string,
        "pro",
        sub.status as string,
        sub.current_period_end
          ? new Date((sub.current_period_end as number) * 1000).toISOString()
          : null,
      );
    }
  }

  return { ok: true };
}
