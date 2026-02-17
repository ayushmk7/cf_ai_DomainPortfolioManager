import { DomainPilotAgent } from "./agent/DomainPilotAgent";
import { BulkDnsUpdateWorkflow } from "./workflows/BulkDnsUpdateWorkflow";
import { DomainOnboardingWorkflow } from "./workflows/DomainOnboardingWorkflow";
import type { Env } from "./types";

export { DomainPilotAgent, DomainOnboardingWorkflow, BulkDnsUpdateWorkflow };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json({ ok: true, service: "domain-pilot-backend" });
    }

    if (url.pathname.startsWith("/agent")) {
      const userId = url.searchParams.get("name") ?? "anonymous";
      const id = env.DOMAIN_PILOT_AGENT.idFromName(userId);
      const stub = env.DOMAIN_PILOT_AGENT.get(id);
      return stub.fetch(request);
    }

    return new Response("Not Found", { status: 404 });
  },
};
