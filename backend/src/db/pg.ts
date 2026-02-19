/**
 * Postgres layer for user accounts and subscriptions.
 * Uses fetch-based Postgres wire protocol (e.g. Neon serverless driver or Hyperdrive).
 * Falls back gracefully when DATABASE_URL / HYPERDRIVE is not configured.
 */

import type { Env } from "../types";

export interface PgUser {
  id: string;
  firebase_uid: string;
  email: string;
  display_name: string | null;
  created_at: string;
}

export interface PgSubscription {
  id: string;
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan: string;
  status: string;
  current_period_end: string | null;
  created_at: string;
  updated_at: string;
}

const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  firebase_uid TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT UNIQUE,
  plan TEXT DEFAULT 'free',
  status TEXT DEFAULT 'inactive',
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
`;

function getConnectionString(env: Env): string | null {
  if (env.HYPERDRIVE) {
    return (env.HYPERDRIVE as any).connectionString;
  }
  return env.DATABASE_URL ?? null;
}

export function isPostgresConfigured(env: Env): boolean {
  return getConnectionString(env) !== null;
}

/**
 * Run a raw SQL query against Postgres via the connection string.
 * This is a minimal implementation; in production use a proper driver.
 * When DATABASE_URL is a Neon serverless URL, use their HTTP API.
 */
export async function pgQuery(
  env: Env,
  sql: string,
  _params: unknown[] = [],
): Promise<Record<string, unknown>[]> {
  const connStr = getConnectionString(env);
  if (!connStr) throw new Error("Postgres not configured");

  // Neon serverless HTTP endpoint
  if (connStr.includes("neon.tech") || connStr.includes("neon")) {
    const url = connStr.replace(/^postgres(ql)?:\/\//, "https://").split("?")[0];
    const res = await fetch(`${url}/sql`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: sql, params: _params }),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Postgres query failed: ${txt}`);
    }
    const data = (await res.json()) as { rows: Record<string, unknown>[] };
    return data.rows ?? [];
  }

  // Placeholder for other Postgres drivers (e.g. pg over Hyperdrive)
  throw new Error("Non-Neon Postgres requires a compatible driver. Set up Hyperdrive or use Neon serverless.");
}

export async function runMigrations(env: Env): Promise<void> {
  if (!isPostgresConfigured(env)) return;
  for (const stmt of MIGRATION_SQL.split(";").filter((s) => s.trim())) {
    await pgQuery(env, stmt + ";");
  }
}

export async function upsertUser(
  env: Env,
  firebaseUid: string,
  email: string,
  displayName: string | null,
): Promise<PgUser | null> {
  if (!isPostgresConfigured(env)) return null;
  const id = crypto.randomUUID();
  await pgQuery(
    env,
    `INSERT INTO users (id, firebase_uid, email, display_name)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (firebase_uid) DO UPDATE SET email = EXCLUDED.email, display_name = EXCLUDED.display_name`,
    [id, firebaseUid, email, displayName],
  );
  const rows = await pgQuery(env, `SELECT * FROM users WHERE firebase_uid = $1 LIMIT 1`, [firebaseUid]);
  return (rows[0] as unknown as PgUser) ?? null;
}

export async function getUserByFirebaseUid(env: Env, firebaseUid: string): Promise<PgUser | null> {
  if (!isPostgresConfigured(env)) return null;
  const rows = await pgQuery(env, `SELECT * FROM users WHERE firebase_uid = $1 LIMIT 1`, [firebaseUid]);
  return (rows[0] as unknown as PgUser) ?? null;
}

export async function getSubscription(env: Env, userId: string): Promise<PgSubscription | null> {
  if (!isPostgresConfigured(env)) return null;
  const rows = await pgQuery(env, `SELECT * FROM subscriptions WHERE user_id = $1 LIMIT 1`, [userId]);
  return (rows[0] as unknown as PgSubscription) ?? null;
}

export async function upsertSubscription(
  env: Env,
  userId: string,
  stripeCustomerId: string,
  stripeSubscriptionId: string,
  plan: string,
  status: string,
  periodEnd: string | null,
): Promise<void> {
  if (!isPostgresConfigured(env)) return;
  const id = crypto.randomUUID();
  await pgQuery(
    env,
    `INSERT INTO subscriptions (id, user_id, stripe_customer_id, stripe_subscription_id, plan, status, current_period_end, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (stripe_subscription_id) DO UPDATE
       SET status = EXCLUDED.status, current_period_end = EXCLUDED.current_period_end, updated_at = NOW()`,
    [id, userId, stripeCustomerId, stripeSubscriptionId, plan, status, periodEnd],
  );
}
