/**
 * WHOIS monitoring: fetch and cache WHOIS data for domains.
 * When WHOIS_API_KEY is set, uses WhoisXMLAPI (whoisserver/WhoisService) and stores parsed data.
 */

import { pgQuery } from "../db/pg";
import type { Env } from "../types";

export interface WhoisCacheRow {
  id: string;
  domain_id: string;
  registrar: string | null;
  registrant_org: string | null;
  expiry_date: string | null;
  fetched_at: string;
}

const WHOIS_API_URL = "https://www.whoisxmlapi.com/whoisserver/WhoisService";

interface WhoisXmlApiResponse {
  WhoisRecord?: {
    domainName?: string;
    registrarName?: string;
    registrant?: { organization?: string };
    nameServers?: { rawText?: string; hostNames?: string };
    expires?: string;
  };
}

function parseExpiry(expires: string | undefined): string | null {
  if (!expires || typeof expires !== "string") return null;
  const d = new Date(expires);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export async function fetchAndCacheWhois(
  env: Env,
  domainId: string,
  domainName: string,
): Promise<WhoisCacheRow | null> {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  let registrar: string | null = null;
  let registrantOrg: string | null = null;
  let nameservers: string | null = null;
  let expiryDate: string | null = null;
  let rawJson: string;

  if (env.WHOIS_API_KEY) {
    try {
      const url = `${WHOIS_API_URL}?domainName=${encodeURIComponent(domainName)}&apiKey=${encodeURIComponent(env.WHOIS_API_KEY)}&outputFormat=JSON`;
      const res = await fetch(url);
      const data = (await res.json()) as WhoisXmlApiResponse;
      rawJson = JSON.stringify(data);
      const rec = data.WhoisRecord;
      if (rec) {
        registrar = rec.registrarName ?? null;
        registrantOrg = rec.registrant?.organization ?? null;
        if (rec.nameServers?.hostNames) {
          nameservers = typeof rec.nameServers.hostNames === "string" ? rec.nameServers.hostNames : JSON.stringify(rec.nameServers.hostNames);
        } else if (rec.nameServers?.rawText) {
          nameservers = rec.nameServers.rawText;
        }
        expiryDate = parseExpiry(rec.expires);
      }
    } catch (e) {
      rawJson = JSON.stringify({ error: String(e), domain: domainName });
    }
  } else {
    rawJson = JSON.stringify({ placeholder: true, domain: domainName });
  }

  await pgQuery(
    env,
    `INSERT INTO whois_cache (id, domain_id, raw_json, registrar, registrant_org, nameservers, expiry_date, fetched_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, domainId, rawJson, registrar, registrantOrg, nameservers, expiryDate, now],
  );
  const rows = await pgQuery(
    env,
    `SELECT id, domain_id, registrar, registrant_org, expiry_date, fetched_at FROM whois_cache WHERE domain_id = $1 ORDER BY fetched_at DESC LIMIT 1`,
    [domainId],
  );
  return (rows[0] as unknown as WhoisCacheRow) ?? null;
}

export async function getWhoisCache(env: Env, domainId: string): Promise<WhoisCacheRow | null> {
  const rows = await pgQuery(
    env,
    `SELECT id, domain_id, registrar, registrant_org, expiry_date, fetched_at FROM whois_cache WHERE domain_id = $1 ORDER BY fetched_at DESC LIMIT 1`,
    [domainId],
  );
  return (rows[0] as unknown as WhoisCacheRow) ?? null;
}
