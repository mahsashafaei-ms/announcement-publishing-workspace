import type { IAnnouncement, PublicationOperation } from "../mocks";
import { isDefinitiveRefusal } from "./errors";
import { decideSnapshot } from "./snapshot";
import { isTerminal } from "./types";
import type { Issue, OperationRecord, WorkspaceState } from "./types";

/**
 * `request` is the client request number (see `OperationRecord.feedbackRequest`). The controller
 * assigns one, in start order, to every publish, status and list request.
 */
export type WorkspaceAction =
  | { type: "workspace/reset" }
  | { type: "announcements/loading" }
  | { type: "announcements/loaded"; items: IAnnouncement[] }
  | { type: "announcements/failed"; issue: Issue }
  | { type: "recovery/started" }
  | { type: "recovery/succeeded"; operations: PublicationOperation[]; request: number }
  | { type: "recovery/failed"; issue: Issue }
  | { type: "attempt/started"; operationId: string; announcementId: string; at: string; request: number }
  | { type: "publish/resending"; operationId: string; request: number }
  | { type: "publish/failed"; operationId: string; issue: Issue; request: number }
  | {
      type: "snapshot/received";
      operationId: string;
      snapshot: PublicationOperation;
      source: "publish" | "status";
      request: number;
    }
  | { type: "status/failed"; operationId: string; issue: Issue; request: number }
  | { type: "status/notRecorded"; operationId: string; issue: Issue; request: number }
  | { type: "check/started"; operationId: string }
  | { type: "check/ended"; operationId: string };

export const initialState: WorkspaceState = {
  announcements: { status: "loading" },
  recovery: { status: "recovering" },
  operations: new Map(),
  nextSeq: 1,
};

const newRecord = (
  fields: Pick<OperationRecord, "operationId" | "announcementId" | "seq" | "createdAt">,
): OperationRecord => ({
  ...fields,
  snapshot: null,
  publishRequest: "sending",
  checking: false,
  issue: null,
  feedbackRequest: 0,
  integrityNote: null,
});

const withRecord = (state: WorkspaceState, record: OperationRecord): WorkspaceState => ({
  ...state,
  operations: new Map(state.operations).set(record.operationId, record),
});

const updateRecord = (
  state: WorkspaceState,
  operationId: string,
  change: (record: OperationRecord) => OperationRecord,
): WorkspaceState => {
  const record = state.operations.get(operationId);
  // Late responses for unknown operations are dropped, never invented into existence.
  if (!record) return state;
  const next = change(record);
  return next === record ? state : withRecord(state, next);
};

/**
 * The one rule for request feedback: a response may replace the feedback unless its request
 * started before the one that last wrote it. So an older success cannot erase a newer failure,
 * and a delayed failure cannot overwrite newer feedback. (Starting a publish or resend also
 * claims the slot, so only its own response or newer ones count.) Once the outcome is terminal
 * there is nothing left to warn about, so a communication error can never shadow a confirmed result.
 */
const withFeedback = (record: OperationRecord, request: number, issue: Issue | null): OperationRecord => {
  if (request < record.feedbackRequest) return record;
  return { ...record, feedbackRequest: request, issue: isTerminal(record.snapshot) ? null : issue };
};

/** Facts are merged by version (decideSnapshot), independently of which request carried them. */
const applySnapshot = (record: OperationRecord, incoming: PublicationOperation): OperationRecord => {
  const decision = decideSnapshot(record.snapshot, incoming, record);
  if (decision.action === "reject") return { ...record, integrityNote: decision.reason };
  if (decision.action === "ignore") return record;
  // A terminal outcome makes any pending warning moot.
  const issue = isTerminal(decision.snapshot) ? null : record.issue;
  return { ...record, snapshot: decision.snapshot, createdAt: decision.snapshot.createdAt, issue };
};

const receiveSnapshot = (
  record: OperationRecord,
  snapshot: PublicationOperation,
  source: "publish" | "status",
  request: number,
): OperationRecord => {
  const merged = applySnapshot(record, snapshot);
  // While a publish request is still in flight a status result must not claim it has settled.
  const publishRequest =
    source === "publish" || merged.publishRequest === "unconfirmed" ? "accepted" : merged.publishRequest;
  // A successful response resolves the feedback, but only if it answers a newer request.
  return withFeedback({ ...merged, publishRequest }, request, null);
};

const recover = (state: WorkspaceState, operations: PublicationOperation[], request: number): WorkspaceState => {
  // listOperations has no ordering promise; sort by service creation time, ties by list position.
  const ordered = operations
    .map((snapshot, index) => ({ snapshot, index }))
    .sort((a, b) => a.snapshot.createdAt.localeCompare(b.snapshot.createdAt) || a.index - b.index);
  let next = state;
  for (const { snapshot } of ordered) {
    const existing = next.operations.get(snapshot.operationId);
    if (existing) {
      next = withRecord(next, receiveSnapshot(existing, snapshot, "status", request));
      continue;
    }
    const record: OperationRecord = {
      ...newRecord({
        operationId: snapshot.operationId,
        announcementId: snapshot.announcementId,
        seq: next.nextSeq,
        createdAt: snapshot.createdAt,
      }),
      snapshot,
      publishRequest: "accepted",
      feedbackRequest: request,
    };
    next = { ...withRecord(next, record), nextSeq: next.nextSeq + 1 };
  }
  return { ...next, recovery: { status: "ready" } };
};

export const workspaceReducer = (state: WorkspaceState, action: WorkspaceAction): WorkspaceState => {
  switch (action.type) {
    case "workspace/reset":
      return initialState;
    case "announcements/loading":
      return { ...state, announcements: { status: "loading" } };
    case "announcements/loaded":
      return { ...state, announcements: { status: "ready", value: action.items } };
    case "announcements/failed":
      return { ...state, announcements: { status: "failed", issue: action.issue } };
    case "recovery/started":
      return { ...state, recovery: { status: "recovering" } };
    case "recovery/succeeded":
      return recover(state, action.operations, action.request);
    case "recovery/failed":
      // Records we already hold stay: a failed read never erases confirmed information.
      return { ...state, recovery: { status: "failed", issue: action.issue } };
    case "attempt/started": {
      // An operation ID identifies one attempt; never replace an attempt we already track.
      if (state.operations.has(action.operationId)) return state;
      const record = {
        ...newRecord({
          operationId: action.operationId,
          announcementId: action.announcementId,
          seq: state.nextSeq,
          createdAt: action.at,
        }),
        feedbackRequest: action.request,
      };
      return { ...withRecord(state, record), nextSeq: state.nextSeq + 1 };
    }
    case "publish/resending":
      // A resend is a newer request: it owns the feedback from now on.
      return updateRecord(state, action.operationId, (record) => ({
        ...record,
        publishRequest: "sending",
        issue: null,
        feedbackRequest: Math.max(record.feedbackRequest, action.request),
      }));
    case "publish/failed":
      return updateRecord(state, action.operationId, (record) => {
        if (isDefinitiveRefusal(action.issue) && record.snapshot === null) {
          // A refusal is a fact about this attempt (nothing was created), not transient feedback.
          return {
            ...record,
            publishRequest: "refused",
            issue: action.issue,
            feedbackRequest: Math.max(record.feedbackRequest, action.request),
          };
        }
        return withFeedback({ ...record, publishRequest: "unconfirmed" }, action.request, action.issue);
      });
    case "snapshot/received":
      return updateRecord(state, action.operationId, (record) =>
        receiveSnapshot(record, action.snapshot, action.source, action.request),
      );
    case "status/failed":
      return updateRecord(state, action.operationId, (record) => withFeedback(record, action.request, action.issue));
    case "status/notRecorded":
      // While the publish request is still in flight "not recorded" may simply mean "not yet".
      return updateRecord(state, action.operationId, (record) =>
        record.publishRequest === "sending" ? record : withFeedback(record, action.request, action.issue),
      );
    case "check/started":
      return updateRecord(state, action.operationId, (record) => ({ ...record, checking: true }));
    case "check/ended":
      return updateRecord(state, action.operationId, (record) => ({ ...record, checking: false }));
  }
};
