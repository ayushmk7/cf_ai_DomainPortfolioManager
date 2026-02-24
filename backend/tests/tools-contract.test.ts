import { describe, expect, it } from "vitest";
import { createToolset } from "../src/agent/tools";

describe("tool contracts", () => {
  it("includes all required backend tools", () => {
    const fakeAgent = {} as never;
    const tools = createToolset(fakeAgent);
    expect(Object.keys(tools).sort()).toEqual(
      [
        "addDnsRecord",
        "addDomain",
        "bulkUpdate",
        "checkDomainHealth",
        "deleteDnsRecord",
        "getAlerts",
        "getDnsHistory",
        "getDnsRecords",
        "handleApprovalResponse",
        "queryDomains",
        "searchHistory",
        "updateDomain",
      ].sort(),
    );
  });
});
