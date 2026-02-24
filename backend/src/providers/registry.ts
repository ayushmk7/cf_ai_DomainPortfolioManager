import { CloudflareDnsProvider } from "./cloudflare";
import {
  GoDaddyDnsProvider,
  NamecheapDnsProvider,
  Route53DnsProvider,
  VercelDnsProvider,
} from "./stubs";
import type { DnsProvider } from "./types";

const registry: Record<string, DnsProvider> = {
  cloudflare: CloudflareDnsProvider,
  godaddy: GoDaddyDnsProvider,
  namecheap: NamecheapDnsProvider,
  route53: Route53DnsProvider,
  vercel: VercelDnsProvider,
};

export function getProvider(type: string): DnsProvider | null {
  return registry[type] ?? null;
}

export function listProviderTypes(): string[] {
  return Object.keys(registry);
}
