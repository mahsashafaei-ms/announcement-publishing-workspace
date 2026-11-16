import type { IAnnouncement } from "../mocks";
import type { PublicationKind, PublicationView } from "../domain/selectors";
import type { IssueKind } from "../domain/types";
import { ISSUE_LABEL, VIEW_LABEL } from "./format";

/** What a screen-reader user should hear about for one announcement. */
export interface StatusSignal {
  title: string;
  kind: PublicationKind;
  operationId: string | null;
  issueKind: IssueKind | null;
  /** Identity of the current issue: a new failure of the same kind is still a new event. */
  issueKey: string | null;
}

/** Keyed by announcement ID. Null while the workspace is not ready (loading, recovering, after a reset). */
export type StatusSignals = ReadonlyMap<string, StatusSignal> | null;

const OUTCOMES = new Set<PublicationKind>(["published", "rejected", "unconfirmed"]);

export const toSignals = (
  announcements: readonly IAnnouncement[],
  views: ReadonlyMap<string, PublicationView>,
  ready: boolean,
): StatusSignals => {
  if (!ready) return null;
  const signals = new Map<string, StatusSignal>();
  for (const announcement of announcements) {
    const view = views.get(announcement.id);
    if (!view) continue;
    const record = "attempt" in view ? view.attempt : view.latestRefusal;
    const issue = record?.issue ?? null;
    signals.set(announcement.id, {
      title: announcement.title,
      kind: view.kind,
      operationId: record?.operationId ?? null,
      issueKind: issue?.kind ?? null,
      issueKey: issue ? `${record?.operationId}|${issue.kind}|${issue.requestId ?? ""}|${issue.occurredAt}` : null,
    });
  }
  return signals;
};

/** A stable string, so the announcer only reacts when something announceable may have changed. */
export const signalsKey = (signals: StatusSignals): string =>
  signals === null
    ? "not-ready"
    : [...signals].map(([id, s]) => `${id}:${s.kind}:${s.operationId ?? ""}:${s.issueKey ?? ""}`).join("|");

/**
 * The text to announce when the signals change from `previous` to `next`:
 * - nothing while the workspace is not ready, which also clears stale text after a reset;
 * - nothing for the first ready snapshot (restoring history is not a new publication event);
 * - a confirmed outcome or an "Outcome unconfirmed" state when the kind changes to one of them;
 * - a new request problem when its identity changes, even if the kind stays the same
 *   (for example a status check failing while the publication is still processing).
 */
export const describeChanges = (previous: StatusSignals, next: StatusSignals): string => {
  if (next === null || previous === null) return "";
  const messages: string[] = [];
  for (const [id, signal] of next) {
    const before = previous.get(id);
    const kindChanged = before?.kind !== signal.kind && OUTCOMES.has(signal.kind);
    const newIssue = signal.issueKey !== null && signal.issueKey !== before?.issueKey;
    const issueText = newIssue && signal.issueKind ? ISSUE_LABEL[signal.issueKind] : null;
    if (kindChanged) {
      messages.push(`${signal.title}: ${VIEW_LABEL[signal.kind]}${issueText ? ` (${issueText})` : ""}`);
    } else if (issueText) {
      messages.push(`${signal.title}: ${issueText}`);
    }
  }
  return messages.join(". ");
};
