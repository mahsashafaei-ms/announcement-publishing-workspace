import type { IAnnouncement, PublicationOperation } from "../mocks";

/**
 * A communication or consistency problem. It describes a *request*, never the
 * publication itself, so it can coexist with a confirmed snapshot.
 */
export type IssueKind =
  | "response-lost" // publish reached (or may have reached) the service, answer never came back
  | "status-unavailable" // service said it cannot report status right now
  | "not-recorded" // service answered "I have no such operation"
  | "operation-conflict" // operation ID already belongs to another announcement
  | "unknown-announcement"
  | "invalid-request" // the client refused to send: an ID breaks the service contract (nothing was sent)
  | "unexpected"; // anything else, including generic TypeError/RangeError: outcome unknown

export interface Issue {
  kind: IssueKind;
  /** Service request ID when available; useful for debugging, shown as a reference only. */
  requestId?: string;
  /** Raw message kept for debugging. Never contains a stack trace. */
  detail: string;
  occurredAt: string;
}

/**
 * Lifecycle of the *publish request* of one attempt (not of the publication):
 * - sending: request in flight, nothing is known yet
 * - accepted: at least one publish response arrived
 * - unconfirmed: the request failed in a way that may still have created the operation
 * - refused: the service definitively did not create this operation
 */
export type PublishRequestState = "sending" | "accepted" | "unconfirmed" | "refused";

export interface OperationRecord {
  operationId: string;
  announcementId: string;
  /** Monotonic insertion counter. Orders attempts without trusting any clock. */
  seq: number;
  createdAt: string;
  /** Newest service snapshot we have accepted. Null until the service tells us anything. */
  snapshot: PublicationOperation | null;
  publishRequest: PublishRequestState;
  checking: boolean;
  /** Latest unresolved request problem. Always null once a terminal outcome is known. */
  issue: Issue | null;
  /**
   * Client request number of the newest response that wrote `issue` (set it or cleared it).
   * Request numbers order *requests by start time*; snapshot versions order *facts*. A response
   * may change the feedback only if its request is newer; its snapshot is merged regardless.
   */
  feedbackRequest: number;
  /** Set when the service sent a conflicting snapshot that we refused to apply. */
  integrityNote: string | null;
}

export type Loadable<T> = { status: "loading" } | { status: "ready"; value: T } | { status: "failed"; issue: Issue };

export type RecoveryState = { status: "recovering" } | { status: "ready" } | { status: "failed"; issue: Issue };

export interface WorkspaceState {
  announcements: Loadable<IAnnouncement[]>;
  recovery: RecoveryState;
  /**
   * Keyed by operation ID. A Map, not a plain object: any nonblank string is a valid ID,
   * including "constructor", "toString" and "__proto__", which collide with Object.prototype.
   */
  operations: ReadonlyMap<string, OperationRecord>;
  nextSeq: number;
}

export const isTerminal = (snapshot: PublicationOperation | null): boolean =>
  snapshot !== null && snapshot.version === 2;

/** An attempt that may still produce a publication: outcome not yet known. */
export const isUnresolved = (record: OperationRecord): boolean =>
  record.publishRequest !== "refused" && !isTerminal(record.snapshot);
