export function toIsoDate(input: string): string {
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Unable to parse date: ${input}`);
  }
  return parsed.toISOString();
}

export function daysUntil(isoDate: string): number {
  const target = new Date(isoDate).getTime();
  const now = Date.now();
  return Math.ceil((target - now) / 86400000);
}

export function isWithinDays(isoDate: string | null, dayWindow: number): boolean {
  if (!isoDate) return false;
  const remaining = daysUntil(isoDate);
  return remaining >= 0 && remaining <= dayWindow;
}

export function nowIso(): string {
  return new Date().toISOString();
}
