import type { DnsRecordType } from "../types";

const IPV4_REGEX =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const IPV6_REGEX = /^[0-9a-fA-F:]+$/;

export function assertValidTtl(ttl?: number): number {
  const value = ttl ?? 3600;
  if (!Number.isInteger(value) || value < 60 || value > 86400) {
    throw new Error("TTL must be an integer between 60 and 86400");
  }
  return value;
}

export function assertPriorityIfRequired(type: DnsRecordType, priority?: number): number | null {
  if (type === "MX" || type === "SRV") {
    if (priority === undefined || !Number.isInteger(priority)) {
      throw new Error(`${type} record requires an integer priority`);
    }
    return priority;
  }
  return null;
}

export function assertValidRecordValue(type: DnsRecordType, value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error("DNS value cannot be empty");
  }

  switch (type) {
    case "A":
      if (!IPV4_REGEX.test(normalized)) throw new Error("A record must be a valid IPv4 address");
      break;
    case "AAAA":
      if (!IPV6_REGEX.test(normalized)) throw new Error("AAAA record must be a valid IPv6 address");
      break;
    case "CNAME":
    case "NS":
      if (!normalized.includes(".")) throw new Error(`${type} record must point to a hostname`);
      break;
    default:
      break;
  }

  return normalized;
}
