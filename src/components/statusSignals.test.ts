import type { PublicationView } from "../domain/selectors";
import type { Issue, IssueKind } from "../domain/types";
import { processing, published, record } from "../test/fixtures";
import { describeChanges, signalsKey, toSignals } from "./statusSignals";

const announcements = [
  { id: "ann-101", title: "One", body: "" },
  { id: "ann-102", title: "Two", body: "" },
];
const issue = (kind: IssueKind, requestId: string): Issue => ({ kind, requestId, detail: "", occurredAt: "t" });

const processingView = (issueValue: Issue | null = null, operationId = "op-1"): PublicationView => ({
  kind: "processing",
  attempt: record({ operationId, publishRequest: "accepted", snapshot: processing(operationId), issue: issueValue }),
  latestRefusal: null,
});
const publishedView = (): PublicationView => {
  const snapshot = published();
  if (snapshot.status !== "published") throw new Error("fixture");
  return {
    kind: "published",
    attempt: record({ publishRequest: "accepted", snapshot }),
    snapshot,
    latestRefusal: null,
  };
};
const notSubmitted: PublicationView = { kind: "not-submitted", latestRefusal: null };

const signals = (first: PublicationView, second: PublicationView = notSubmitted, ready = true) =>
  toSignals(
    announcements,
    new Map([
      ["ann-101", first],
      ["ann-102", second],
    ]),
    ready,
  );

describe("describeChanges", () => {
  it("does not announce initial hydration (the first ready snapshot)", () => {
    expect(describeChanges(null, signals(publishedView()))).toBe("");
  });

  it("announces a confirmed outcome", () => {
    expect(describeChanges(signals(processingView()), signals(publishedView()))).toBe("One: Published");
  });

  it("announces a new status-check failure even though the state stays Processing", () => {
    const before = signals(processingView());
    const after = signals(processingView(issue("status-unavailable", "r1")));
    expect(describeChanges(before, after)).toBe("One: Status check failed");
  });

  it("announces a second failure of the same kind as a new event (different request)", () => {
    const first = signals(processingView(issue("status-unavailable", "r1")));
    const second = signals(processingView(issue("status-unavailable", "r2")));
    expect(describeChanges(first, second)).toBe("One: Status check failed");
  });

  it("stays silent when the same issue is seen again", () => {
    const same = signals(processingView(issue("status-unavailable", "r1")));
    expect(signalsKey(same)).toBe(signalsKey(signals(processingView(issue("status-unavailable", "r1")))));
    expect(describeChanges(same, same)).toBe("");
  });

  it("stays silent when an issue is resolved", () => {
    expect(describeChanges(signals(processingView(issue("status-unavailable", "r1"))), signals(processingView()))).toBe(
      "",
    );
  });

  it("combines an outcome and its cause into one message, without duplicates", () => {
    const before = signals({
      kind: "submitting",
      attempt: record({ publishRequest: "sending" }),
      latestRefusal: null,
    });
    const after = signals({
      kind: "unconfirmed",
      attempt: record({ publishRequest: "unconfirmed", issue: issue("response-lost", "r1") }),
      latestRefusal: null,
    });
    expect(describeChanges(before, after)).toBe("One: Outcome unconfirmed (Publish response lost)");
  });

  it("keeps announcements independent and lists each change once", () => {
    const before = signals(processingView(), processingView(null, "op-2"));
    const after = signals(publishedView(), processingView(issue("status-unavailable", "r9"), "op-2"));
    expect(describeChanges(before, after)).toBe("One: Published. Two: Status check failed");
  });

  it("clears the message while the workspace is not ready (e.g. right after a reset)", () => {
    expect(toSignals(announcements, new Map(), false)).toBeNull();
    expect(describeChanges(signals(publishedView()), null)).toBe("");
  });
});
