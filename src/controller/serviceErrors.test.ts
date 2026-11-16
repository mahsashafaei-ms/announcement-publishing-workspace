import { AnnouncementMockError } from "../mocks";
import { isDefinitiveRefusal } from "../domain/errors";
import { invalidRequestIssue, toIssue } from "./serviceErrors";

const at = "2025-01-01T00:00:00.000Z";

describe("toIssue (service error boundary)", () => {
  it.each([
    ["RESPONSE_LOST", "response-lost", false],
    ["STATUS_UNAVAILABLE", "status-unavailable", false],
    ["UNKNOWN_ANNOUNCEMENT", "unknown-announcement", true],
    ["OPERATION_ID_CONFLICT", "operation-conflict", true],
  ] as const)("keeps the official mapping: %s -> %s (definitive refusal: %s)", (code, kind, definitive) => {
    const issue = toIssue(new AnnouncementMockError(code, "request-1", "op-1", "ann-101"), at);
    expect(issue).toMatchObject({ kind, requestId: "request-1", occurredAt: at });
    expect(isDefinitiveRefusal(issue)).toBe(definitive);
  });

  it("does not treat a generic TypeError as a refusal: the request may have reached the service", () => {
    const issue = toIssue(new TypeError("Cannot read properties of undefined"), at);
    expect(issue.kind).toBe("unexpected");
    expect(isDefinitiveRefusal(issue)).toBe(false);
  });

  it("does not treat a generic RangeError as a refusal", () => {
    const issue = toIssue(new RangeError("out of range"), at);
    expect(issue.kind).toBe("unexpected");
    expect(isDefinitiveRefusal(issue)).toBe(false);
  });

  it("treats anything unrecognised as unexpected", () => {
    for (const thrown of [new Error("boom"), "string", null, undefined, 42]) {
      const issue = toIssue(thrown, at);
      expect(issue.kind).toBe("unexpected");
      expect(isDefinitiveRefusal(issue)).toBe(false);
    }
  });

  it("does not leak stack traces into the issue", () => {
    expect(toIssue(new Error("boom"), at).detail).toBe("Error: boom");
  });

  it("only a request refused by the client's own validation is an invalid request", () => {
    expect(isDefinitiveRefusal(invalidRequestIssue(at))).toBe(true);
  });
});
