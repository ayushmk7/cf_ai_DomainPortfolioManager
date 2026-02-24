import { DomainPilotAgent } from "./agent/DomainPilotAgent";
import { BulkDnsUpdateWorkflow } from "./workflows/BulkDnsUpdateWorkflow";
import { DomainOnboardingWorkflow } from "./workflows/DomainOnboardingWorkflow";
import {
  acceptInvitation,
  createClient,
  createInvitation,
  createNotification,
  createProviderConnection,
  deleteClient,
  deleteProviderConnection,
  getClientById,
  getProviderConnection,
  getUserByFirebaseUid,
  isPostgresConfigured,
  listClientsForOrg,
  listOrgsForUser,
  listPendingInvitationsForOrg,
  listNotifications,
  listProviderConnections,
  markNotificationRead,
  pgHealthCheck,
  pgQuery,
  requireRole,
  resolveOrgForUser,
  revokeInvitation,
  runMigrationRunner,
  updateClient,
  updateProviderConnectionStatus,
  upsertUser,
} from "./db/pg";
import * as dbPg from "./agent/db-pg";
import { getProvider } from "./providers/registry";
import { checkAndStoreSsl } from "./services/ssl";
import { runProviderSync } from "./services/sync";
import { fetchAndCacheWhois } from "./services/whois";
import type { Env } from "./types";
import { decryptCredentials, encryptCredentials } from "./utils/encryption";

const PG_USER_ID_HEADER = "X-PG-User-Id";
const ORG_ID_HEADER = "X-Org-Id";

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
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Org-Id",
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

/** Resolves Firebase UID and Postgres user id for the agent. Pass pgUserId in header so agent can scope DB calls. */
async function resolveUserForAgent(
  request: Request,
  env: Env,
): Promise<{ firebaseUid: string; pgUserId: string | null }> {
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
        const data = (await res.json()) as {
          users?: { localId: string; email?: string; displayName?: string }[];
        };
        const user = data.users?.[0];
        if (user?.localId) {
          if (isPostgresConfigured(env)) {
            const pgUser = await upsertUser(
              env,
              user.localId,
              user.email ?? "",
              user.displayName ?? null,
            );
            return { firebaseUid: user.localId, pgUserId: pgUser?.id ?? null };
          }
          return { firebaseUid: user.localId, pgUserId: null };
        }
      }
    } catch {
      // Fall through
    }
  }

  const firebaseUid = nameParam ?? "anonymous";
  if (isPostgresConfigured(env)) {
    let pgUser = await getUserByFirebaseUid(env, firebaseUid);
    if (!pgUser && firebaseUid === "anonymous") {
      pgUser = await upsertUser(env, "anonymous", "anonymous@localhost", null);
    }
    return { firebaseUid, pgUserId: pgUser?.id ?? null };
  }
  return { firebaseUid, pgUserId: null };
}

/** Clone request and add X-PG-User-Id and X-Org-Id headers for the agent. */
function withAgentHeaders(
  request: Request,
  pgUserId: string | null,
  orgId: string | null,
): Request {
  const headers = new Headers(request.headers);
  if (pgUserId) headers.set(PG_USER_ID_HEADER, pgUserId);
  if (orgId) headers.set(ORG_ID_HEADER, orgId);
  return new Request(request.url, {
    method: request.method,
    headers,
    body: request.body,
  });
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
      await runMigrationRunner(env);
      const db = await pgHealthCheck(env);
      const res = Response.json({ ok: true, service: "domain-pilot-backend", db });
      return withCors(res, request);
    }

    if (url.pathname.startsWith("/agent")) {
      const { firebaseUid, pgUserId } = await resolveUserForAgent(request, env);
      if (isPostgresConfigured(env) && !pgUserId) {
        const unauth = Response.json({ error: "Unauthorized", message: "Postgres is configured; sign in required." }, { status: 401 });
        return withCors(unauth, request);
      }
      const orgIdHeader = request.headers.get(ORG_ID_HEADER);
      const orgContext = pgUserId && isPostgresConfigured(env)
        ? await resolveOrgForUser(env, pgUserId, orgIdHeader)
        : null;
      const orgId = orgContext?.orgId ?? null;
      const id = env.DOMAIN_PILOT_AGENT.idFromName(firebaseUid);
      const stub = env.DOMAIN_PILOT_AGENT.get(id);
      const requestWithHeaders = withAgentHeaders(request, pgUserId, orgId);
      const response = await stub.fetch(requestWithHeaders);
      return withCors(response, request);
    }

    // REST routes (require auth when Postgres is configured)
    const { pgUserId } = await resolveUserForAgent(request, env);
    if (isPostgresConfigured(env) && !pgUserId) {
      const unauth = Response.json({ error: "Unauthorized" }, { status: 401 });
      return withCors(unauth, request);
    }

    const orgIdHeader = request.headers.get(ORG_ID_HEADER);
    const orgContext = pgUserId && isPostgresConfigured(env)
      ? await resolveOrgForUser(env, pgUserId, orgIdHeader)
      : null;
    const orgId = orgContext?.orgId ?? null;

    if (request.method === "GET" && url.pathname === "/orgs" && pgUserId) {
      const orgs = await listOrgsForUser(env, pgUserId);
      return withCors(Response.json({ orgs }), request);
    }

    if (request.method === "GET" && url.pathname === "/domains" && pgUserId) {
      const limit = Math.min(Number(url.searchParams.get("limit")) || 100, 500);
      const clientId = url.searchParams.get("clientId") ?? undefined;
      const domains = await dbPg.listDomains(env, pgUserId, orgId, clientId || null);
      const slice = domains.slice(0, limit);
      return withCors(Response.json({ domains: slice }), request);
    }

    const domainIdOnlyMatch = url.pathname.match(/^\/domains\/([^/]+)$/);
    if (request.method === "GET" && domainIdOnlyMatch && pgUserId) {
      const domainId = domainIdOnlyMatch[1];
      const domain = await dbPg.getDomainById(env, pgUserId, domainId, orgId);
      if (!domain) {
        return withCors(Response.json({ error: "Domain not found" }, { status: 404 }), request);
      }
      return withCors(Response.json({ domain }), request);
    }
    if (request.method === "PATCH" && domainIdOnlyMatch && pgUserId && orgContext) {
      try {
        requireRole(orgContext.role, ["owner", "admin", "member"]);
      } catch (e) {
        const err = e as Error & { status?: number };
        return withCors(Response.json({ error: err.message }, { status: err.status ?? 403 }), request);
      }
      const domainId = domainIdOnlyMatch[1];
      const domain = await dbPg.getDomainById(env, pgUserId, domainId, orgId);
      if (!domain) {
        return withCors(Response.json({ error: "Domain not found" }, { status: 404 }), request);
      }
      let body: { registrar?: string; expiry_date?: string; notes?: string; status?: string; client_id?: string };
      try {
        body = (await request.json()) as typeof body;
      } catch {
        return withCors(Response.json({ error: "Invalid JSON" }, { status: 400 }), request);
      }
      const updated = await dbPg.updateDomain(
        env,
        pgUserId,
        (domain as { domain: string }).domain,
        {
          registrar: body.registrar,
          expiryDate: body.expiry_date,
          notes: body.notes,
          status: body.status as "active" | "parked" | "for_sale" | "expired" | undefined,
          clientId: body.client_id,
        },
        orgId,
      );
      return withCors(Response.json({ domain: updated }), request);
    }

    const domainsIdMatch = url.pathname.match(/^\/domains\/([^/]+)\/records$/);
    if (request.method === "GET" && domainsIdMatch && pgUserId) {
      const domainId = domainsIdMatch[1];
      const domain = await dbPg.getDomainById(env, pgUserId, domainId, orgId);
      if (!domain) {
        return withCors(Response.json({ error: "Domain not found" }, { status: 404 }), request);
      }
      const recordType = url.searchParams.get("recordType") ?? undefined;
      const records = await dbPg.getDnsRecordsForDomain(env, pgUserId, domainId, recordType);
      return withCors(Response.json({ domain: domain.domain, records }), request);
    }

    if (request.method === "GET" && url.pathname === "/history" && pgUserId) {
      const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 200);
      const changes = await dbPg.recentChanges(env, pgUserId, limit, orgId);
      return withCors(Response.json({ history: changes }), request);
    }

    if (request.method === "GET" && url.pathname === "/alerts" && pgUserId) {
      const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 200);
      const alerts = await dbPg.listAlerts(env, pgUserId, limit, orgId);
      return withCors(Response.json({ alerts }), request);
    }

    if (request.method === "GET" && url.pathname === "/clients" && pgUserId && orgId && orgContext) {
      try {
        requireRole(orgContext.role, ["owner", "admin", "member", "viewer"]);
      } catch (e) {
        const err = e as Error & { status?: number };
        return withCors(Response.json({ error: err.message }, { status: err.status ?? 403 }), request);
      }
      const clients = await listClientsForOrg(env, orgId);
      return withCors(Response.json({ clients }), request);
    }

    if (request.method === "POST" && url.pathname === "/clients" && pgUserId && orgId && orgContext) {
      try {
        requireRole(orgContext.role, ["owner", "admin", "member"]);
      } catch (e) {
        const err = e as Error & { status?: number };
        return withCors(Response.json({ error: err.message }, { status: err.status ?? 403 }), request);
      }
      let body: { name?: string; contact_email?: string; contact_name?: string; notes?: string; color?: string };
      try {
        body = (await request.json()) as typeof body;
      } catch {
        return withCors(Response.json({ error: "Invalid JSON" }, { status: 400 }), request);
      }
      if (!body?.name?.trim()) {
        return withCors(Response.json({ error: "name is required" }, { status: 400 }), request);
      }
      const client = await createClient(env, orgId, {
        name: body.name.trim(),
        contact_email: body.contact_email ?? null,
        contact_name: body.contact_name ?? null,
        notes: body.notes ?? null,
        color: body.color ?? null,
      });
      return withCors(Response.json({ client }), request);
    }

    const clientsIdMatch = url.pathname.match(/^\/clients\/([^/]+)$/);
    if (request.method === "GET" && clientsIdMatch && pgUserId && orgId && orgContext) {
      try {
        requireRole(orgContext.role, ["owner", "admin", "member", "viewer"]);
      } catch (e) {
        const err = e as Error & { status?: number };
        return withCors(Response.json({ error: err.message }, { status: err.status ?? 403 }), request);
      }
      const clientId = clientsIdMatch[1];
      const client = await getClientById(env, orgId, clientId);
      if (!client) {
        return withCors(Response.json({ error: "Client not found" }, { status: 404 }), request);
      }
      return withCors(Response.json({ client }), request);
    }

    if (request.method === "PATCH" && clientsIdMatch && pgUserId && orgId && orgContext) {
      try {
        requireRole(orgContext.role, ["owner", "admin", "member"]);
      } catch (e) {
        const err = e as Error & { status?: number };
        return withCors(Response.json({ error: err.message }, { status: err.status ?? 403 }), request);
      }
      const clientId = clientsIdMatch[1];
      let body: { name?: string; contact_email?: string; contact_name?: string; notes?: string; color?: string };
      try {
        body = (await request.json()) as typeof body;
      } catch {
        return withCors(Response.json({ error: "Invalid JSON" }, { status: 400 }), request);
      }
      const client = await updateClient(env, orgId, clientId, {
        name: body.name,
        contact_email: body.contact_email,
        contact_name: body.contact_name,
        notes: body.notes,
        color: body.color,
      });
      if (!client) {
        return withCors(Response.json({ error: "Client not found" }, { status: 404 }), request);
      }
      return withCors(Response.json({ client }), request);
    }

    if (request.method === "DELETE" && clientsIdMatch && pgUserId && orgId && orgContext) {
      try {
        requireRole(orgContext.role, ["owner", "admin"]);
      } catch (e) {
        const err = e as Error & { status?: number };
        return withCors(Response.json({ error: err.message }, { status: err.status ?? 403 }), request);
      }
      const clientId = clientsIdMatch[1];
      const deleted = await deleteClient(env, orgId, clientId);
      if (!deleted) {
        return withCors(Response.json({ error: "Client not found" }, { status: 404 }), request);
      }
      return withCors(Response.json({ ok: true }), request);
    }

    if (request.method === "GET" && url.pathname === "/invitations" && pgUserId && orgId && orgContext) {
      try {
        requireRole(orgContext.role, ["owner", "admin"]);
      } catch (e) {
        const err = e as Error & { status?: number };
        return withCors(Response.json({ error: err.message }, { status: err.status ?? 403 }), request);
      }
      const invitations = await listPendingInvitationsForOrg(env, orgId);
      return withCors(Response.json({ invitations }), request);
    }

    if (request.method === "POST" && url.pathname === "/invitations" && pgUserId && orgId && orgContext) {
      try {
        requireRole(orgContext.role, ["owner", "admin"]);
      } catch (e) {
        const err = e as Error & { status?: number };
        return withCors(Response.json({ error: err.message }, { status: err.status ?? 403 }), request);
      }
      let body: { email?: string; role?: string };
      try {
        body = (await request.json()) as typeof body;
      } catch {
        return withCors(Response.json({ error: "Invalid JSON" }, { status: 400 }), request);
      }
      const email = body?.email?.trim();
      const role = (body?.role ?? "member") as "admin" | "member" | "viewer";
      if (!email) {
        return withCors(Response.json({ error: "email is required" }, { status: 400 }), request);
      }
      if (!["admin", "member", "viewer"].includes(role)) {
        return withCors(Response.json({ error: "role must be admin, member, or viewer" }, { status: 400 }), request);
      }
      const invitation = await createInvitation(env, orgId, pgUserId, email, role);
      const inviteLink = `${url.origin.replace(/\/$/, "")}/invite?token=${encodeURIComponent(invitation.token)}`;
      return withCors(
        Response.json({
          invitation: {
            id: invitation.id,
            email: invitation.email,
            role: invitation.role,
            expires_at: invitation.expires_at,
            invite_link: inviteLink,
          },
        }),
        request,
      );
    }

    if (request.method === "POST" && url.pathname === "/invitations/accept" && pgUserId) {
      let body: { token?: string };
      try {
        body = (await request.json()) as typeof body;
      } catch {
        return withCors(Response.json({ error: "Invalid JSON" }, { status: 400 }), request);
      }
      const token = body?.token?.trim();
      if (!token) {
        return withCors(Response.json({ error: "token is required" }, { status: 400 }), request);
      }
      const result = await acceptInvitation(env, token, pgUserId);
      if (!result) {
        return withCors(Response.json({ error: "Invalid or expired invitation" }, { status: 400 }), request);
      }
      return withCors(Response.json({ ok: true, orgId: result.orgId }), request);
    }

    const invitationsIdMatch = url.pathname.match(/^\/invitations\/([^/]+)$/);
    if (request.method === "DELETE" && invitationsIdMatch && pgUserId && orgId && orgContext) {
      try {
        requireRole(orgContext.role, ["owner", "admin"]);
      } catch (e) {
        const err = e as Error & { status?: number };
        return withCors(Response.json({ error: err.message }, { status: err.status ?? 403 }), request);
      }
      const invitationId = invitationsIdMatch[1];
      await revokeInvitation(env, orgId, invitationId);
      return withCors(Response.json({ ok: true }), request);
    }

    if (request.method === "GET" && url.pathname === "/providers" && pgUserId && orgId && orgContext) {
      try {
        requireRole(orgContext.role, ["owner", "admin", "member", "viewer"]);
      } catch (e) {
        const err = e as Error & { status?: number };
        return withCors(Response.json({ error: err.message }, { status: err.status ?? 403 }), request);
      }
      const connections = await listProviderConnections(env, orgId);
      const safe = connections.map((c) => ({
        id: c.id,
        provider_type: c.provider_type,
        display_name: c.display_name,
        status: c.status,
        last_sync_at: c.last_sync_at,
        last_error: c.last_error,
        created_at: c.created_at,
      }));
      return withCors(Response.json({ providers: safe }), request);
    }

    if (request.method === "POST" && url.pathname === "/providers" && pgUserId && orgId && orgContext) {
      try {
        requireRole(orgContext.role, ["owner", "admin"]);
      } catch (e) {
        const err = e as Error & { status?: number };
        return withCors(Response.json({ error: err.message }, { status: err.status ?? 403 }), request);
      }
      let body: { provider_type?: string; display_name?: string; credentials?: { apiToken?: string } };
      try {
        body = (await request.json()) as typeof body;
      } catch {
        return withCors(Response.json({ error: "Invalid JSON" }, { status: 400 }), request);
      }
      const providerType = body?.provider_type?.trim() ?? "cloudflare";
      const provider = getProvider(providerType);
      if (!provider) {
        return withCors(Response.json({ error: "Unknown provider type" }, { status: 400 }), request);
      }
      const creds = body?.credentials ?? {};
      try {
        const ok = await provider.testConnection(creds);
        if (!ok) {
          return withCors(Response.json({ error: "Connection test failed" }, { status: 400 }), request);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return withCors(Response.json({ error: msg }, { status: 400 }), request);
      }
      const credentialsEncrypted = await encryptCredentials(env, JSON.stringify(creds));
      const conn = await createProviderConnection(env, orgId, {
        provider_type: providerType,
        display_name: body.display_name ?? null,
        credentials_encrypted: credentialsEncrypted,
      });
      return withCors(
        Response.json({
          provider: {
            id: conn.id,
            provider_type: conn.provider_type,
            display_name: conn.display_name,
            status: conn.status,
          },
        }),
        request,
      );
    }

    const providersIdMatch = url.pathname.match(/^\/providers\/([^/]+)\/(test|sync)$/);
    if (request.method === "POST" && providersIdMatch && pgUserId && orgId && orgContext) {
      try {
        requireRole(orgContext.role, ["owner", "admin"]);
      } catch (e) {
        const err = e as Error & { status?: number };
        return withCors(Response.json({ error: err.message }, { status: err.status ?? 403 }), request);
      }
      const connectionId = providersIdMatch[1];
      const action = providersIdMatch[2];
      const conn = await getProviderConnection(env, orgId, connectionId);
      if (!conn) {
        return withCors(Response.json({ error: "Provider not found" }, { status: 404 }), request);
      }
      const provider = getProvider(conn.provider_type);
      if (!provider) {
        return withCors(Response.json({ error: "Provider type not available" }, { status: 400 }), request);
      }
      const credentialsRaw = conn.credentials_encrypted
        ? await decryptCredentials(env, conn.credentials_encrypted)
        : "{}";
      const credentials = JSON.parse(credentialsRaw) as Record<string, string>;
      if (action === "test") {
        try {
          const ok = await provider.testConnection(credentials);
          await updateProviderConnectionStatus(env, connectionId, ok ? "active" : "error", ok ? null : "Test failed");
          return withCors(Response.json({ ok }), request);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await updateProviderConnectionStatus(env, connectionId, "error", msg);
          return withCors(Response.json({ error: msg }, { status: 400 }), request);
        }
      }
      if (action === "sync") {
        const result = await runProviderSync(env, orgId, connectionId, credentials);
        if (result.ok) {
          await updateProviderConnectionStatus(env, connectionId, "active", null, new Date().toISOString());
        } else {
          await updateProviderConnectionStatus(env, connectionId, "error", result.error ?? "Sync failed");
        }
        return withCors(
          Response.json({
            ok: result.ok,
            summary: { zones_imported: result.zonesImported, records_updated: result.recordsUpdated },
            error: result.error,
          }),
          request,
        );
      }
    }

    const providerDeleteMatch = url.pathname.match(/^\/providers\/([^/]+)$/);
    if (request.method === "DELETE" && providerDeleteMatch && pgUserId && orgId && orgContext) {
      try {
        requireRole(orgContext.role, ["owner", "admin"]);
      } catch (e) {
        const err = e as Error & { status?: number };
        return withCors(Response.json({ error: err.message }, { status: err.status ?? 403 }), request);
      }
      const connectionId = providerDeleteMatch[1];
      const conn = await getProviderConnection(env, orgId, connectionId);
      if (!conn) {
        return withCors(Response.json({ error: "Provider not found" }, { status: 404 }), request);
      }
      await deleteProviderConnection(env, orgId, connectionId);
      return withCors(Response.json({ ok: true }), request);
    }

    if (request.method === "GET" && url.pathname === "/notifications" && pgUserId) {
      const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 200);
      const unreadOnly = url.searchParams.get("unreadOnly") === "true";
      const notifications = await listNotifications(env, pgUserId, limit, unreadOnly);
      return withCors(Response.json({ notifications }), request);
    }

    const notificationsReadMatch = url.pathname.match(/^\/notifications\/([^/]+)\/read$/);
    if (request.method === "PATCH" && notificationsReadMatch && pgUserId) {
      const notificationId = notificationsReadMatch[1];
      const ok = await markNotificationRead(env, pgUserId, notificationId);
      return withCors(Response.json({ ok }), request);
    }

    const notFound = new Response("Not Found", { status: 404 });
    return withCors(notFound, request);
  },

  async scheduled(
    event: ScheduledEvent,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    const cron = event.cron;
    if (!isPostgresConfigured(env)) return;

    if (cron === "*/15 * * * *") {
      const connections = await pgQuery(env, `SELECT id, org_id, provider_type, credentials_encrypted FROM provider_connections WHERE status = 'active'`, []);
      for (const row of connections as { id: string; org_id: string; provider_type: string; credentials_encrypted: string | null }[]) {
        if (!row.credentials_encrypted) continue;
        try {
          const raw = await decryptCredentials(env, row.credentials_encrypted);
          const creds = JSON.parse(raw) as Record<string, string>;
          const result = await runProviderSync(env, row.org_id, row.id, creds);
          await updateProviderConnectionStatus(
            env,
            row.id,
            result.ok ? "active" : "error",
            result.ok ? null : result.error ?? "Sync failed",
            new Date().toISOString(),
          );
        } catch {
          await updateProviderConnectionStatus(env, row.id, "error", "Sync failed");
        }
      }
    } else if (cron === "0 * * * *") {
      const domains = await pgQuery(
        env,
        `SELECT id, domain, user_id, org_id, expiry_date FROM domains WHERE status = 'active' AND expiry_date IS NOT NULL AND expiry_date >= NOW() AND expiry_date <= NOW() + interval '30 days' LIMIT 200`,
        [],
      ) as { id: string; domain: string; user_id: string; org_id: string | null; expiry_date: string }[];
      for (const d of domains) {
        const days = Math.ceil((new Date(d.expiry_date).getTime() - Date.now()) / 86400000);
        if (days < 0) continue;
        const level = days <= 7 ? "critical_expiry" : "upcoming_expiry";
        try {
          await dbPg.insertScheduledAlert(
            env,
            d.user_id,
            {
              domainId: d.id,
              alertType: level,
              scheduledFor: new Date().toISOString(),
              message: `${d.domain} expires in ${days} days.`,
            },
            d.org_id,
          );
        } catch {
          // Skip duplicate or error
        }
      }
    } else if (cron === "0 0 * * *") {
      const domains = await pgQuery(
        env,
        `SELECT id, domain FROM domains WHERE status = 'active' LIMIT 50`,
        [],
      ) as { id: string; domain: string }[];
      for (const d of domains) {
        try {
          await checkAndStoreSsl(env, d.id, d.domain);
        } catch {
          // Skip
        }
        try {
          await fetchAndCacheWhois(env, d.id, d.domain);
        } catch {
          // Skip
        }
      }
    } else if (cron === "0 0 * * 0") {
      const orgs = await pgQuery(env, `SELECT id, owner_user_id FROM organizations LIMIT 500`, []) as { id: string; owner_user_id: string }[];
      for (const org of orgs) {
        const counts = await pgQuery(
          env,
          `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE expiry_date IS NOT NULL AND expiry_date >= NOW() AND expiry_date <= NOW() + interval '30 days') AS expiring FROM domains WHERE org_id = $1`,
          [org.id],
        ) as { total: number; expiring: number }[];
        const total = Number(counts[0]?.total ?? 0);
        const expiring = Number(counts[0]?.expiring ?? 0);
        await createNotification(
          env,
          org.owner_user_id,
          "weekly_digest",
          JSON.stringify({ totalDomains: total, expiringSoon: expiring }),
          org.id,
        );
      }
    }
  },
};
