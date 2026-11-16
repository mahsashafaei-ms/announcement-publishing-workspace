import { initialState, workspaceReducer } from "./workspaceReducer";
import type { WorkspaceAction } from "./workspaceReducer";
import type { Issue, IssueKind, WorkspaceState } from "./types";
import { processing, published, rejected } from "../test/fixtures";

const run = (actions: WorkspaceAction[], from: WorkspaceState = initialState) => actions.reduce(workspaceReducer, from);
const start = (operationId = "op-1", announcementId = "ann-101", request = 1): WorkspaceAction => ({
  type: "attempt/started",
  operationId,
  announcementId,
  at: "2025-01-01T00:00:00.000Z",
  request,
});
const issue = (kind: IssueKind, requestId: string): Issue => ({ kind, requestId, detail: kind, occurredAt: "now" });
const lost = issue("response-lost", "r1");
const unavailable = issue("status-unavailable", "r2");
const conflict = issue("operation-conflict", "r3");
const unexpected = issue("unexpected", "r4");
const op = (state: WorkspaceState, id = "op-1") => state.operations.get(id);

describe("workspaceReducer", () => {
  it("keeps Published when an older processing publish response arrives afterwards", () => {
    const state = run([
      start(),
      { type: "snapshot/received", operationId: "op-1", snapshot: published(), source: "status", request: 2 },
      { type: "snapshot/received", operationId: "op-1", snapshot: processing(), source: "publish", request: 1 },
    ]);
    expect(op(state)?.snapshot?.status).toBe("published");
    expect(op(state)?.publishRequest).toBe("accepted");
  });

  it("does not let a status result mark an in-flight publish request as settled", () => {
    const state = run([
      start(),
      { type: "snapshot/received", operationId: "op-1", snapshot: processing(), source: "status", request: 2 },
    ]);
    expect(op(state)?.publishRequest).toBe("sending");
  });

  it("a lost publish response leaves the attempt unconfirmed, not refused", () => {
    const state = run([start(), { type: "publish/failed", operationId: "op-1", issue: lost, request: 1 }]);
    expect(op(state)).toMatchObject({ publishRequest: "unconfirmed", snapshot: null, issue: lost });
  });

  it("an unexpected publish error leaves the attempt recoverable, never refused", () => {
    const state = run([start(), { type: "publish/failed", operationId: "op-1", issue: unexpected, request: 1 }]);
    expect(op(state)).toMatchObject({ publishRequest: "unconfirmed", snapshot: null, issue: unexpected });
  });

  it("an operation ID conflict is a definitive refusal", () => {
    const state = run([start(), { type: "publish/failed", operationId: "op-1", issue: conflict, request: 1 }]);
    expect(op(state)?.publishRequest).toBe("refused");
  });

  it("request failures never erase or shadow a confirmed snapshot", () => {
    const state = run([
      start(),
      { type: "snapshot/received", operationId: "op-1", snapshot: published(), source: "publish", request: 1 },
      { type: "status/failed", operationId: "op-1", issue: unavailable, request: 2 },
      { type: "publish/failed", operationId: "op-1", issue: lost, request: 3 },
    ]);
    expect(op(state)?.snapshot?.status).toBe("published");
    expect(op(state)?.issue).toBeNull();
  });

  it("a terminal snapshot clears an earlier warning even when it answers an older request", () => {
    const state = run([
      start(),
      { type: "status/failed", operationId: "op-1", issue: unavailable, request: 2 },
      { type: "snapshot/received", operationId: "op-1", snapshot: published(), source: "publish", request: 1 },
    ]);
    expect(op(state)?.snapshot?.status).toBe("published");
    expect(op(state)?.issue).toBeNull();
  });

  it("ignores responses for operations it does not know", () => {
    const state = run([
      { type: "snapshot/received", operationId: "ghost", snapshot: processing("ghost"), source: "status", request: 1 },
    ]);
    expect(state.operations.size).toBe(0);
  });

  it("records a conflicting terminal snapshot as an integrity note and keeps the first outcome", () => {
    const state = run([
      start(),
      { type: "snapshot/received", operationId: "op-1", snapshot: published(), source: "status", request: 2 },
      { type: "snapshot/received", operationId: "op-1", snapshot: rejected(), source: "status", request: 3 },
    ]);
    expect(op(state)?.snapshot?.status).toBe("published");
    expect(op(state)?.integrityNote).not.toBeNull();
  });

  it("'not recorded' is ignored while the publish request is still in flight", () => {
    const issue = { kind: "not-recorded" as const, detail: "none", occurredAt: "now" };
    const sending = run([start(), { type: "status/notRecorded", operationId: "op-1", issue, request: 2 }]);
    expect(op(sending)?.issue).toBeNull();
    const settled = run([
      start(),
      { type: "publish/failed", operationId: "op-1", issue: lost, request: 1 },
      { type: "status/notRecorded", operationId: "op-1", issue, request: 2 },
    ]);
    expect(op(settled)?.issue?.kind).toBe("not-recorded");
  });

  it("recovery restores operations ordered by creation time and marks recovery ready", () => {
    const later = { ...processing("op-b", "ann-102"), createdAt: "2025-01-01T00:00:09.000Z" };
    const earlier = { ...rejected("op-a", "ann-102"), createdAt: "2025-01-01T00:00:01.000Z" };
    const state = run([{ type: "recovery/succeeded", operations: [later, earlier], request: 1 }]);
    expect(state.recovery.status).toBe("ready");
    expect(op(state, "op-a")?.seq).toBeLessThan(op(state, "op-b")?.seq ?? 0);
    expect(op(state, "op-a")?.publishRequest).toBe("accepted");
  });

  it("recovery failure is its own state, not an empty operation list, and keeps known records", () => {
    const failedFirst = run([{ type: "recovery/failed", issue: unavailable }]);
    expect(failedFirst.recovery.status).toBe("failed");
    expect(failedFirst.operations.size).toBe(0);

    const known = run([
      { type: "recovery/succeeded", operations: [published("op-1")], request: 1 },
      { type: "recovery/started" },
      { type: "recovery/failed", issue: unavailable },
    ]);
    expect(op(known)?.snapshot?.status).toBe("published");
  });

  it("a new attempt does not overwrite the previous rejected attempt", () => {
    const state = run([
      start("op-1"),
      { type: "snapshot/received", operationId: "op-1", snapshot: rejected(), source: "publish", request: 1 },
      start("op-2", "ann-101", 2),
    ]);
    expect([...state.operations.keys()]).toEqual(["op-1", "op-2"]);
    expect(op(state)?.snapshot?.status).toBe("rejected");
  });

  it("workspace/reset returns to the initial state", () => {
    const state = run([start(), { type: "workspace/reset" }]);
    expect(state).toBe(initialState);
  });
});

describe("request feedback ordering", () => {
  it("an older successful publish response does not erase a newer status-check failure", () => {
    // publish = request 1, status check = request 2 fails, then the publish response arrives.
    const state = run([
      start(),
      { type: "status/failed", operationId: "op-1", issue: unavailable, request: 2 },
      { type: "snapshot/received", operationId: "op-1", snapshot: processing(), source: "publish", request: 1 },
    ]);
    expect(op(state)?.snapshot?.status).toBe("processing"); // the fact is still accepted
    expect(op(state)?.issue).toBe(unavailable); // the newer feedback stays
  });

  it("a delayed failure does not overwrite feedback from a newer request", () => {
    const state = run([
      start(),
      { type: "snapshot/received", operationId: "op-1", snapshot: processing(), source: "status", request: 2 },
      { type: "publish/failed", operationId: "op-1", issue: lost, request: 1 },
    ]);
    expect(op(state)?.issue).toBeNull();
    expect(op(state)?.snapshot?.status).toBe("processing");
  });

  it("a newer successful check resolves an earlier error even when the version is unchanged", () => {
    const state = run([
      start(),
      { type: "snapshot/received", operationId: "op-1", snapshot: processing(), source: "publish", request: 1 },
      { type: "status/failed", operationId: "op-1", issue: unavailable, request: 2 },
      { type: "snapshot/received", operationId: "op-1", snapshot: processing(), source: "status", request: 3 },
    ]);
    expect(op(state)?.issue).toBeNull();
  });

  it("keeps each operation's feedback independent", () => {
    const state = run([
      start("op-1", "ann-101", 1),
      start("op-2", "ann-102", 2),
      { type: "status/failed", operationId: "op-1", issue: unavailable, request: 3 },
      {
        type: "snapshot/received",
        operationId: "op-2",
        snapshot: processing("op-2", "ann-102"),
        source: "status",
        request: 4,
      },
    ]);
    expect(op(state, "op-1")?.issue).toBe(unavailable);
    expect(op(state, "op-2")?.issue).toBeNull();
  });
});

describe("special operation IDs", () => {
  it.each(["constructor", "toString", "__proto__", "hasOwnProperty"])("stores, finds and updates %s", (id) => {
    const state = run([
      start(id),
      { type: "snapshot/received", operationId: id, snapshot: processing(id), source: "publish", request: 1 },
      { type: "snapshot/received", operationId: id, snapshot: published(id), source: "status", request: 2 },
    ]);
    expect(state.operations.size).toBe(1);
    expect(op(state, id)).toMatchObject({ operationId: id, publishRequest: "accepted" });
    expect(op(state, id)?.snapshot?.status).toBe("published");
  });

  it("recovers them from the operation list", () => {
    const ids = ["constructor", "toString", "__proto__"];
    const state = run([{ type: "recovery/succeeded", operations: ids.map((id) => published(id)), request: 1 }]);
    expect([...state.operations.keys()]).toEqual(ids);
  });
});
