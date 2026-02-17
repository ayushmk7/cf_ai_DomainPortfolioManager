import { describe, expect, it } from "vitest";
import { daysUntil, isWithinDays, toIsoDate } from "../src/utils/date-utils";
import { assertValidDomain } from "../src/utils/domain-validator";
import { assertPriorityIfRequired, assertValidRecordValue, assertValidTtl } from "../src/utils/dns-validator";

describe("domain-validator", () => {
  it("accepts valid domains", () => {
    expect(assertValidDomain("example.com")).toBe("example.com");
    expect(assertValidDomain("Blog.Example.COM")).toBe("blog.example.com");
  });

  it("rejects invalid domains", () => {
    expect(() => assertValidDomain("localhost")).toThrow();
    expect(() => assertValidDomain("bad_domain")).toThrow();
  });
});

describe("dns-validator", () => {
  it("validates common A record", () => {
    expect(assertValidRecordValue("A", "203.0.113.1")).toBe("203.0.113.1");
  });

  it("enforces ttl and priority rules", () => {
    expect(assertValidTtl()).toBe(3600);
    expect(() => assertValidTtl(10)).toThrow();
    expect(assertPriorityIfRequired("MX", 10)).toBe(10);
    expect(() => assertPriorityIfRequired("MX")).toThrow();
    expect(assertPriorityIfRequired("TXT", 50)).toBeNull();
  });
});

describe("date-utils", () => {
  it("parses dates and computes windows", () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString();
    expect(() => toIsoDate("March 15, 2027")).not.toThrow();
    expect(daysUntil(tomorrow)).toBeGreaterThanOrEqual(1);
    expect(isWithinDays(tomorrow, 2)).toBe(true);
  });
});
