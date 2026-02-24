import { describe, expect, it } from "vitest";
import { isPostgresConfigured, runMigrationRunner } from "../src/db/pg";
import type { Env } from "../src/types";

describe("Postgres layer", () => {
  it("isPostgresConfigured returns false when DATABASE_URL and HYPERDRIVE are unset", () => {
    const env = {} as Env;
    expect(isPostgresConfigured(env)).toBe(false);
  });

  it("isPostgresConfigured returns true when DATABASE_URL is set", () => {
    const env = { DATABASE_URL: "postgresql://localhost/test" } as Env;
    expect(isPostgresConfigured(env)).toBe(true);
  });

  it("runMigrationRunner returns without throwing when Postgres is not configured", async () => {
    const env = {} as Env;
    await expect(runMigrationRunner(env)).resolves.toBeUndefined();
  });
});
