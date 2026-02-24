/**
 * SSL certificate monitoring: check via Certificate Transparency (crt.sh) or store placeholder.
 * Stores issuer, valid_from, valid_to in ssl_checks for alerts and UI.
 */

import { pgQuery } from "../db/pg";
import type { Env } from "../types";

export interface SslCheckRow {
  id: string;
  domain_id: string;
  issuer: string | null;
  valid_from: string | null;
  valid_to: string | null;
  checked_at: string;
}

const CRT_SH_URL = "https://crt.sh/?q=";

interface CrtShEntry {
  issuer_name?: string;
  not_before?: string;
  not_after?: string;
  common_name?: string;
}

function parseIso(s: string | undefined): string | null {
  if (!s || typeof s !== "string") return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export async function checkAndStoreSsl(
  env: Env,
  domainId: string,
  domainName: string,
): Promise<SslCheckRow | null> {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  let issuer: string | null = null;
  let validFrom: string | null = null;
  let validTo: string | null = null;
  let sans: string | null = null;

  try {
    const url = `${CRT_SH_URL}${encodeURIComponent(domainName)}&output=json`;
    const res = await fetch(url);
    const data = (await res.json()) as CrtShEntry[];
    if (Array.isArray(data) && data.length > 0) {
      const entry = data[0];
      issuer = entry.issuer_name ?? null;
      validFrom = parseIso(entry.not_before);
      validTo = parseIso(entry.not_after);
      const names = data.slice(0, 10).map((e) => e.common_name ?? e.issuer_name).filter(Boolean);
      if (names.length) sans = names.join(",");
    }
  } catch {
    // Keep nulls; we still record that a check was attempted
  }

  await pgQuery(
    env,
    `INSERT INTO ssl_checks (id, domain_id, issuer, valid_from, valid_to, sans, checked_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, domainId, issuer, validFrom, validTo, sans, now],
  );
  const rows = await pgQuery(
    env,
    `SELECT id, domain_id, issuer, valid_from, valid_to, checked_at FROM ssl_checks WHERE domain_id = $1 ORDER BY checked_at DESC LIMIT 1`,
    [domainId],
  );
  return (rows[0] as unknown as SslCheckRow) ?? null;
}

export async function getLatestSslCheck(env: Env, domainId: string): Promise<SslCheckRow | null> {
  const rows = await pgQuery(
    env,
    `SELECT id, domain_id, issuer, valid_from, valid_to, checked_at FROM ssl_checks WHERE domain_id = $1 ORDER BY checked_at DESC LIMIT 1`,
    [domainId],
  );
  return (rows[0] as unknown as SslCheckRow) ?? null;
}
