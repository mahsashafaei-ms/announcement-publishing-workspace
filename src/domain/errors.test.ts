import { isDefinitiveRefusal } from "./errors";
import type { IssueKind } from "./types";

const issue = (kind: IssueKind) => ({ kind, detail: "", occurredAt: "2025-01-01T00:00:00.000Z" });

describe("isDefinitiveRefusal", () => {
  it.each([
    ["operation-conflict", true],
    ["unknown-announcement", true],
    ["invalid-request", true],
    ["response-lost", false],
    ["status-unavailable", false],
    ["not-recorded", false],
    ["unexpected", false],
  ] as const)("%s -> %s", (kind, definitive) => {
    expect(isDefinitiveRefusal(issue(kind))).toBe(definitive);
  });
});
