import type { PublicationView } from "../../domain/selectors";
import { isUnresolved } from "../../domain/types";
import { VIEW_HEADING, VIEW_ICON, formatTime } from "../format";
import { StatusBadge } from "../StatusBadge";
import { Icon } from "../ui/Icon";
import { Eyebrow, cx } from "../ui/primitives";
import { kindTone, panelTone } from "../ui/tones";
import { IssueNotice } from "./IssueNotice";

interface PublicationStatusCardProps {
  view: PublicationView;
  /** Automatic status checks are running right now (switch on, tab visible, online). */
  automatic: boolean;
}

function StatusMessage({ view, automatic }: PublicationStatusCardProps) {
  switch (view.kind) {
    case "restoring":
      return <p>Existing publications are being read from the service. A new attempt can begin once this finishes.</p>;
    case "history-unavailable":
      return (
        <>
          <p>
            The service did not return its publication records, so we cannot tell whether this announcement was already
            submitted.
          </p>
          <p>A new attempt is blocked until the history is restored, so nothing is published twice.</p>
        </>
      );
    case "not-submitted":
      return <p>This announcement has not been submitted yet. Publish it when you’re ready.</p>;
    case "submitting":
      return <p>Your request is underway. You can check its status now or work on another announcement.</p>;
    case "processing":
      return (
        <p>
          {automatic
            ? "The service accepted this attempt. We’ll keep checking until its outcome is confirmed."
            : "The service accepted this attempt. Check its status to get the latest result."}
        </p>
      );
    case "unconfirmed":
      return (
        <p>
          We could not confirm whether the service accepted this publication. This is a communication problem, not a
          rejection: it may be processing or already published.
        </p>
      );
    case "published":
      return <p>The publishing service confirmed this announcement is publicly available.</p>;
    case "rejected":
      return (
        <>
          <p className="font-strong text-danger">{view.snapshot.reason}</p>
          <p>The rejected attempt stays in the history. A new attempt uses a new operation ID.</p>
        </>
      );
  }
}

/** The publication state of one announcement: badge, explanation, request problems and confirmed details. */
export function PublicationStatusCard({ view, automatic }: PublicationStatusCardProps) {
  const attempt = "attempt" in view ? view.attempt : null;
  // A request problem only matters while the outcome is still open.
  const issue = attempt && isUnresolved(attempt) ? attempt.issue : null;
  const tone = panelTone[kindTone[view.kind]];

  return (
    <section
      className={cx("mt-4.75 rounded-card border px-3.25 py-3.75 sm:mt-6 sm:p-4 lg:px-5 lg:py-4.5", tone.box)}
      aria-labelledby="publication-heading"
    >
      <div className="mb-3.25 flex items-center justify-between gap-2 sm:mb-4 sm:gap-3">
        <Eyebrow as="span">
          <span id="publication-heading">Publication status</span>
        </Eyebrow>
        <StatusBadge kind={view.kind} />
      </div>
      <div className="flex items-start gap-2.25 sm:gap-2.5 lg:gap-3">
        <span className={cx("grid size-7 shrink-0 place-items-center rounded-lg sm:size-8 sm:rounded-card", tone.icon)}>
          <Icon name={VIEW_ICON[view.kind]} className="size-4.25" />
        </span>
        <div className="min-w-0 [overflow-wrap:anywhere]">
          <h3 className="mt-px mb-1 text-sm leading-normal font-semibold sm:text-md">{VIEW_HEADING[view.kind]}</h3>
          <div className={cx("space-y-1.75 text-xs leading-[1.85] sm:text-sm", tone.text)}>
            <StatusMessage view={view} automatic={automatic} />
            {issue && <IssueNotice issue={issue} hasKnownStatus={attempt?.snapshot != null} automatic={automatic} />}
            {view.latestRefusal?.issue && (
              <IssueNotice issue={view.latestRefusal.issue} hasKnownStatus={false} automatic={automatic} />
            )}
          </div>
        </div>
      </div>
      {view.kind === "published" && (
        <dl className="mt-3 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-1 pl-9.25 text-2xs text-success sm:pl-11 sm:text-xs">
          <dt>Published at</dt>
          <dd>
            <time dateTime={view.snapshot.publishedAt}>{formatTime(view.snapshot.publishedAt)}</time>
          </dd>
          <dt>Publication ID</dt>
          <dd className="[overflow-wrap:anywhere]">
            <code>{view.snapshot.publicationId}</code>
          </dd>
        </dl>
      )}
    </section>
  );
}
