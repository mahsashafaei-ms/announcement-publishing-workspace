import type { PublicationOperation } from "../mocks";
import type { Issue, OperationRecord, WorkspaceState } from "./types";
import { isUnresolved } from "./types";

type Published = Extract<PublicationOperation, { status: "published" }>;
type Rejected = Extract<PublicationOperation, { status: "rejected" }>;

/**
 * What the user should understand about one announcement. `unconfirmed` is a UI-only condition.
 * `restoring` and `history-unavailable` mean "we do not know yet": the service may hold attempts
 * we have not read, so "not submitted" would be an unsupported claim.
 */
export type PublicationView =
  | { kind: "restoring"; latestRefusal: null }
  | { kind: "history-unavailable"; issue: Issue; latestRefusal: null }
  | { kind: "not-submitted"; latestRefusal: OperationRecord | null }
  | { kind: "submitting"; attempt: OperationRecord; latestRefusal: null }
  | { kind: "processing"; attempt: OperationRecord; latestRefusal: null }
  | { kind: "unconfirmed"; attempt: OperationRecord; latestRefusal: null }
  | { kind: "published"; attempt: OperationRecord; snapshot: Published; latestRefusal: null }
  | { kind: "rejected"; attempt: OperationRecord; snapshot: Rejected; latestRefusal: OperationRecord | null };

export type PublicationKind = PublicationView["kind"];

export const selectAttempts = (state: WorkspaceState, announcementId: string): OperationRecord[] =>
  [...state.operations.values()]
    .filter((record) => record.announcementId === announcementId)
    .sort((a, b) => a.seq - b.seq);

const last = <T>(items: T[]): T | undefined => items[items.length - 1];

/**
 * Chooses which known attempt represents the announcement. Priority: a published attempt,
 * then the newest unresolved attempt, then the newest rejected one. Older attempts
 * therefore can never replace the presentation of a newer or successful one.
 */
export const selectAttemptView = (
  attempts: OperationRecord[],
): Exclude<PublicationView, { kind: "restoring" | "history-unavailable" }> => {
  for (const attempt of attempts) {
    if (attempt.snapshot?.status === "published") {
      return { kind: "published", attempt, snapshot: attempt.snapshot, latestRefusal: null };
    }
  }
  const unresolved = last(attempts.filter(isUnresolved));
  if (unresolved) {
    if (unresolved.snapshot?.status === "processing")
      return { kind: "processing", attempt: unresolved, latestRefusal: null };
    if (unresolved.snapshot === null && unresolved.publishRequest === "sending") {
      return { kind: "submitting", attempt: unresolved, latestRefusal: null };
    }
    return { kind: "unconfirmed", attempt: unresolved, latestRefusal: null };
  }
  const newest = last(attempts);
  const latestRefusal = newest?.publishRequest === "refused" ? newest : null;
  const rejected = last(attempts.filter((a) => a.snapshot?.status === "rejected"));
  if (rejected?.snapshot?.status === "rejected") {
    return { kind: "rejected", attempt: rejected, snapshot: rejected.snapshot, latestRefusal };
  }
  return { kind: "not-submitted", latestRefusal };
};

/**
 * The view for one announcement. Known attempts are always shown (confirmed information is never
 * hidden by a failed read), but "not submitted" is only claimed after recovery has succeeded.
 */
export const selectPublicationView = (state: WorkspaceState, announcementId: string): PublicationView => {
  const view = selectAttemptView(selectAttempts(state, announcementId));
  if (view.kind !== "not-submitted" || state.recovery.status === "ready") return view;
  return state.recovery.status === "failed"
    ? { kind: "history-unavailable", issue: state.recovery.issue, latestRefusal: null }
    : { kind: "restoring", latestRefusal: null };
};

export const isWorkspaceReady = (state: WorkspaceState): boolean =>
  state.announcements.status === "ready" && state.recovery.status === "ready";

export interface WorkspaceSummary {
  /** Null while the numbers would be guesses: announcements or history not yet loaded. */
  published: number | null;
  inProgress: number | null;
  total: number | null;
}

export const selectSummary = (state: WorkspaceState): WorkspaceSummary => {
  if (state.announcements.status !== "ready") return { published: null, inProgress: null, total: null };
  const total = state.announcements.value.length;
  if (state.recovery.status !== "ready") return { published: null, inProgress: null, total };
  const kinds = state.announcements.value.map((a) => selectPublicationView(state, a.id).kind);
  return {
    published: kinds.filter((kind) => kind === "published").length,
    inProgress: kinds.filter((kind) => kind === "submitting" || kind === "processing" || kind === "unconfirmed").length,
    total,
  };
};

export type PublishBlockReason =
  "announcements-unavailable" | "recovery-incomplete" | "already-published" | "attempt-unresolved";

/** The single rule for "may a new attempt start now?". The controller enforces it; the UI only reflects it. */
export const canStartAttempt = (
  state: WorkspaceState,
  announcementId: string,
): { ok: true } | { ok: false; reason: PublishBlockReason } => {
  if (state.announcements.status !== "ready" || !state.announcements.value.some((a) => a.id === announcementId)) {
    return { ok: false, reason: "announcements-unavailable" };
  }
  // Until recovery succeeds we cannot know whether this announcement already has an attempt.
  if (state.recovery.status !== "ready") return { ok: false, reason: "recovery-incomplete" };
  const view = selectAttemptView(selectAttempts(state, announcementId));
  if (view.kind === "published") return { ok: false, reason: "already-published" };
  if (view.kind === "submitting" || view.kind === "processing" || view.kind === "unconfirmed") {
    return { ok: false, reason: "attempt-unresolved" };
  }
  return { ok: true };
};

/** Resending the publish request is only meaningful while the service has never confirmed the operation. */
export const canResend = (record: OperationRecord): boolean =>
  record.snapshot === null && record.publishRequest === "unconfirmed";

export const canCheck = (record: OperationRecord): boolean => isUnresolved(record) && !record.checking;
