import type { PublicationOperation } from "../mocks";

export type SnapshotDecision =
  | { action: "apply"; snapshot: PublicationOperation }
  /** Already known or older: ignoring it is the correct, silent outcome. */
  | { action: "ignore"; reason: "duplicate" | "stale" }
  /** Contradicts what we hold. Keep the held snapshot and surface the problem. */
  | { action: "reject"; reason: string };

const sameTerminalOutcome = (a: PublicationOperation, b: PublicationOperation): boolean => {
  if (a.status === "published" && b.status === "published") {
    return a.publicationId === b.publicationId && a.publishedAt === b.publishedAt;
  }
  if (a.status === "rejected" && b.status === "rejected") return a.reason === b.reason;
  return false;
};

/**
 * The single place that decides whether a snapshot may replace what we hold.
 *
 * Responses can arrive in any order and snapshots describe the operation at the
 * time the call was made, so arrival order says nothing about freshness. The
 * service's `version` does: 1 = processing, 2 = terminal. A terminal state is
 * immutable, so the first terminal snapshot wins and a different terminal
 * snapshot at the same version is treated as a conflict instead of an update.
 */
export const decideSnapshot = (
  held: PublicationOperation | null,
  incoming: PublicationOperation,
  owner: { operationId: string; announcementId: string },
): SnapshotDecision => {
  if (incoming.operationId !== owner.operationId) {
    return { action: "reject", reason: "Snapshot belongs to a different operation." };
  }
  if (incoming.announcementId !== owner.announcementId) {
    return { action: "reject", reason: "Snapshot references a different announcement." };
  }
  if (held === null) return { action: "apply", snapshot: incoming };
  if (incoming.version > held.version) return { action: "apply", snapshot: incoming };
  if (incoming.version < held.version) return { action: "ignore", reason: "stale" };
  if (held.version === 1) return { action: "ignore", reason: "duplicate" };
  return sameTerminalOutcome(held, incoming)
    ? { action: "ignore", reason: "duplicate" }
    : {
        action: "reject",
        reason: "Service reported a different terminal outcome for an operation that already finished.",
      };
};
