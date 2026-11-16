import type { ReactNode } from "react";
import { selectAttemptView } from "../../domain/selectors";
import type { PublicationKind } from "../../domain/selectors";
import type { OperationRecord } from "../../domain/types";
import { formatTime } from "../format";
import { StatusBadge } from "../StatusBadge";
import { cx } from "../ui/primitives";
import { kindTone, markerTone } from "../ui/tones";

interface OperationHistoryItemProps {
  attempt: OperationRecord;
  /** 1-based position in chronological order ("Attempt 01" is the oldest). */
  number: number;
  current: boolean;
}

/** The state of one attempt on its own (not of the whole announcement); null for a refused request. */
const attemptKind = (record: OperationRecord): PublicationKind | null =>
  record.publishRequest === "refused" ? null : selectAttemptView([record]).kind;

function HistoryNote({ children }: { children: ReactNode }) {
  return <p className="my-2 text-xs text-danger">{children}</p>;
}

/** One attempt in the timeline: state, timestamps, notes and reference IDs. */
export function OperationHistoryItem({ attempt, number, current }: OperationHistoryItemProps) {
  const kind = attemptKind(attempt);
  return (
    <li className="relative border-l border-line-strong pb-5.75 pl-4.25 last:border-transparent last:pb-0 sm:pl-5.25">
      <span
        className={cx(
          "absolute top-2 -left-1 size-1.75 rounded-full shadow-[0_0_0_4px_var(--color-surface)] forced-colors:bg-[ButtonText]",
          markerTone[kind ? kindTone[kind] : "warning"],
        )}
        aria-hidden="true"
      />
      <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-2.5">
        <div className="flex items-center gap-2.25 text-sm font-strong">
          Attempt {String(number).padStart(2, "0")}
          {current && (
            <span className="rounded-sm border border-line px-1.25 py-px text-3xs font-book text-muted">Current</span>
          )}
        </div>
        {kind ? (
          <StatusBadge kind={kind} />
        ) : (
          <span className="rounded-[5px] bg-warning-soft px-2 py-1.25 text-2xs font-strong text-warning">
            Request not accepted
          </span>
        )}
      </div>
      <div className="mt-1.5 space-y-1.5 text-3xs text-muted sm:text-2xs">
        <p>
          Started <time dateTime={attempt.createdAt}>{formatTime(attempt.createdAt)}</time>
        </p>
        {attempt.snapshot?.status === "published" && (
          <p>
            Published <time dateTime={attempt.snapshot.publishedAt}>{formatTime(attempt.snapshot.publishedAt)}</time>
          </p>
        )}
      </div>
      {attempt.snapshot?.status === "rejected" && <HistoryNote>{attempt.snapshot.reason}</HistoryNote>}
      {attempt.publishRequest === "refused" && (
        <HistoryNote>The request was not accepted; nothing was created.</HistoryNote>
      )}
      {attempt.integrityNote && (
        <HistoryNote>An inconsistent response was ignored: {attempt.integrityNote}</HistoryNote>
      )}
      <details className="mt-2.25 text-2xs text-muted">
        <summary className="min-h-7 w-fit py-1.25">Reference details</summary>
        <dl className="mt-1.5 space-y-2 rounded-md border border-line bg-sunken px-3.5 py-3">
          <div>
            <dt className="text-3xs tracking-[0.05em] uppercase">Operation ID</dt>
            <dd className="mt-0.75">
              <code className="text-2xs">{attempt.operationId}</code>
            </dd>
          </div>
          {attempt.snapshot?.status === "published" && (
            <div>
              <dt className="text-3xs tracking-[0.05em] uppercase">Publication ID</dt>
              <dd className="mt-0.75">
                <code className="text-2xs">{attempt.snapshot.publicationId}</code>
              </dd>
            </div>
          )}
        </dl>
      </details>
    </li>
  );
}
