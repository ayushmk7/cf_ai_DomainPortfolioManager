import { describe, expect, it } from "vitest";
import { ensureTablesExist } from "../src/agent/db";

class RecordingSql {
  public statements: string[] = [];

  exec(query: string): [] {
    this.statements.push(query);
    return [];
  }
}

describe("db schema bootstrap", () => {
  it("creates all required tables", () => {
    const sql = new RecordingSql();
    ensureTablesExist(sql);
    const joined = sql.statements.join("\n");
    expect(joined).toContain("CREATE TABLE IF NOT EXISTS domains");
    expect(joined).toContain("CREATE TABLE IF NOT EXISTS dns_records");
    expect(joined).toContain("CREATE TABLE IF NOT EXISTS dns_change_history");
    expect(joined).toContain("CREATE TABLE IF NOT EXISTS scheduled_alerts");
  });
});
