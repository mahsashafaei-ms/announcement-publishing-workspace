import {
  canCheck,
  canResend,
  canStartAttempt,
  selectAttempts,
  selectAttemptView,
  selectPublicationView,
  selectSummary,
} from "./selectors";
import type { WorkspaceState } from "./types";
import { initialState } from "./workspaceReducer";
import { processing, published, record, rejected } from "../test/fixtures";

const stateWith = (...records: ReturnType<typeof record>[]): WorkspaceState => ({
  ...initialState,
  announcements: { status: "ready", value: [{ id: "ann-101", title: "t", body: "b" }] },
  recovery: { status: "ready" },
  operations: new Map(records.map((r) => [r.operationId, r])),
  nextSeq: 100,
});

describe("selectAttemptView", () => {
  it("is not-submitted without attempts", () => {
    expect(selectAttemptView([]).kind).toBe("not-submitted");
  });

  it("distinguishes submitting, processing and unconfirmed", () => {
    expect(selectAttemptView([record({ publishRequest: "sending" })]).kind).toBe("submitting");
    expect(selectAttemptView([record({ publishRequest: "accepted", snapshot: processing() })]).kind).toBe("processing");
    expect(selectAttemptView([record({ publishRequest: "unconfirmed" })]).kind).toBe("unconfirmed");
  });

  it("a request issue on a processing attempt stays processing (not rejected, not unconfirmed)", () => {
    const issue = { kind: "status-unavailable" as const, detail: "x", occurredAt: "now" };
    expect(selectAttemptView([record({ publishRequest: "accepted", snapshot: processing(), issue })]).kind).toBe(
      "processing",
    );
  });

  it("published beats everything else, whatever the attempt order", () => {
    const attempts = [
      record({ operationId: "a", seq: 1, publishRequest: "accepted", snapshot: published("a") }),
      record({ operationId: "b", seq: 2, publishRequest: "accepted", snapshot: processing("b") }),
    ];
    expect(selectAttemptView(attempts).kind).toBe("published");
  });

  it("a newer unresolved attempt replaces an older rejected one in the presentation", () => {
    const attempts = [
      record({ operationId: "a", seq: 1, publishRequest: "accepted", snapshot: rejected("a") }),
      record({ operationId: "b", seq: 2, publishRequest: "sending" }),
    ];
    const view = selectAttemptView(attempts);
    expect(view.kind).toBe("submitting");
    expect("attempt" in view && view.attempt.operationId).toBe("b");
  });

  it("shows the newest rejected attempt and surfaces a newer refused request", () => {
    const attempts = [
      record({ operationId: "a", seq: 1, publishRequest: "accepted", snapshot: rejected("a") }),
      record({ operationId: "b", seq: 2, publishRequest: "refused" }),
    ];
    const view = selectAttemptView(attempts);
    expect(view.kind).toBe("rejected");
    expect(view.latestRefusal?.operationId).toBe("b");
  });
});

describe("selectAttempts", () => {
  it("returns only that announcement's attempts in insertion order", () => {
    const state = stateWith(
      record({ operationId: "b", seq: 2 }),
      record({ operationId: "a", seq: 1 }),
      record({ operationId: "x", seq: 3, announcementId: "ann-102" }),
    );
    expect(selectAttempts(state, "ann-101").map((r) => r.operationId)).toEqual(["a", "b"]);
  });
});

describe("canStartAttempt", () => {
  it("allows a first attempt and a new attempt after a confirmed rejection", () => {
    expect(canStartAttempt(stateWith(), "ann-101")).toEqual({ ok: true });
    expect(canStartAttempt(stateWith(record({ publishRequest: "accepted", snapshot: rejected() })), "ann-101")).toEqual(
      { ok: true },
    );
  });

  it("blocks while any attempt is unresolved (submitting, processing, unconfirmed)", () => {
    for (const r of [
      record({ publishRequest: "sending" }),
      record({ publishRequest: "accepted", snapshot: processing() }),
      record({ publishRequest: "unconfirmed" }),
    ]) {
      expect(canStartAttempt(stateWith(r), "ann-101")).toEqual({ ok: false, reason: "attempt-unresolved" });
    }
  });

  it("blocks after success", () => {
    expect(
      canStartAttempt(stateWith(record({ publishRequest: "accepted", snapshot: published() })), "ann-101"),
    ).toEqual({ ok: false, reason: "already-published" });
  });

  it("blocks until recovery succeeded, even for announcements without attempts", () => {
    for (const recovery of [
      { status: "recovering" },
      { status: "failed", issue: { kind: "status-unavailable", detail: "", occurredAt: "" } },
    ] as const) {
      expect(canStartAttempt({ ...stateWith(), recovery }, "ann-101")).toEqual({
        ok: false,
        reason: "recovery-incomplete",
      });
    }
  });

  it("blocks unknown announcements and unloaded lists", () => {
    expect(canStartAttempt(stateWith(), "ann-999").ok).toBe(false);
    expect(canStartAttempt({ ...stateWith(), announcements: { status: "loading" } }, "ann-101").ok).toBe(false);
  });
});

describe("recovery actions", () => {
  it("resend is only offered while the service never confirmed the operation", () => {
    expect(canResend(record({ publishRequest: "unconfirmed" }))).toBe(true);
    expect(canResend(record({ publishRequest: "unconfirmed", snapshot: processing() }))).toBe(false);
    expect(canResend(record({ publishRequest: "sending" }))).toBe(false);
  });

  it("status checks are offered for unresolved attempts that are not already being checked", () => {
    expect(canCheck(record({ publishRequest: "unconfirmed" }))).toBe(true);
    expect(canCheck(record({ publishRequest: "unconfirmed", checking: true }))).toBe(false);
    expect(canCheck(record({ publishRequest: "accepted", snapshot: published() }))).toBe(false);
  });
});

describe("selectPublicationView (recovery-aware)", () => {
  const failed = { status: "failed", issue: { kind: "status-unavailable", detail: "", occurredAt: "" } } as const;

  it("never claims 'not submitted' before recovery has succeeded", () => {
    expect(selectPublicationView({ ...stateWith(), recovery: { status: "recovering" } }, "ann-101").kind).toBe(
      "restoring",
    );
    expect(selectPublicationView({ ...stateWith(), recovery: failed }, "ann-101").kind).toBe("history-unavailable");
    expect(selectPublicationView(stateWith(), "ann-101").kind).toBe("not-submitted");
  });

  it("keeps showing confirmed information while a later recovery read is failing", () => {
    const state = { ...stateWith(record({ publishRequest: "accepted", snapshot: published() })), recovery: failed };
    expect(selectPublicationView(state, "ann-101").kind).toBe("published");
  });
});

describe("selectSummary", () => {
  it("reports unknown, not zero, until announcements and history are both loaded", () => {
    expect(selectSummary({ ...stateWith(), announcements: { status: "loading" } })).toEqual({
      published: null,
      inProgress: null,
      total: null,
    });
    expect(selectSummary({ ...stateWith(), recovery: { status: "recovering" } })).toEqual({
      published: null,
      inProgress: null,
      total: 1,
    });
  });

  it("counts published and in-progress announcements from service-backed records", () => {
    expect(selectSummary(stateWith(record({ publishRequest: "accepted", snapshot: published() })))).toEqual({
      published: 1,
      inProgress: 0,
      total: 1,
    });
    expect(selectSummary(stateWith(record({ publishRequest: "unconfirmed" })))).toEqual({
      published: 0,
      inProgress: 1,
      total: 1,
    });
  });
});
