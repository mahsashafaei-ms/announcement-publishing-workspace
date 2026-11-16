import type { Issue } from "../../domain/types";
import { describeIssue, formatTime } from "../format";

interface IssueNoticeProps {
  issue: Issue;
  /** Whether the service has ever confirmed a state for this operation. */
  hasKnownStatus: boolean;
  /** Automatic status checks are running right now. */
  automatic: boolean;
}

/** A request problem in three parts: what happened, what is known, and what to do next. */
export function IssueNotice({ issue, hasKnownStatus, automatic }: IssueNoticeProps) {
  const copy = describeIssue(issue, hasKnownStatus, automatic);
  return (
    <>
      <p className="rounded-[5px] bg-warning-soft/60 px-2.75 py-2.25 font-strong">{copy.what}</p>
      <p>{copy.outcome}</p>
      <p>{copy.next}</p>
      <p className="text-2xs opacity-80">
        Reference: {issue.requestId ?? issue.kind} · {formatTime(issue.occurredAt)}
      </p>
    </>
  );
}
