const DOMAIN_REGEX =
  /^(?=.{1,253}$)(?!-)(?:[a-zA-Z0-9-]{1,63}\.)+[A-Za-z]{2,63}$/;

export function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/\.$/, "");
}

export function isValidDomain(domain: string): boolean {
  return DOMAIN_REGEX.test(normalizeDomain(domain));
}

export function assertValidDomain(domain: string): string {
  const normalized = normalizeDomain(domain);
  if (!isValidDomain(normalized)) {
    throw new Error(`Invalid domain format: ${domain}`);
  }
  return normalized;
}
