import type { Issue, IssueKind } from "../domain/types";
import type { PublicationKind } from "../domain/selectors";
import type { IconName } from "./ui/Icon";

const timeFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export const formatTime = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : timeFormat.format(date);
};

/** Badge text. */
export const VIEW_LABEL: Record<PublicationKind, string> = {
  restoring: "Restoring history",
  "history-unavailable": "History unavailable",
  "not-submitted": "Not submitted",
  submitting: "Sending request",
  processing: "Processing",
  published: "Published",
  rejected: "Rejected",
  unconfirmed: "Outcome unconfirmed",
};

/** Short name of a request problem, used in screen-reader announcements. */
export const ISSUE_LABEL: Record<IssueKind, string> = {
  "response-lost": "Publish response lost",
  "status-unavailable": "Status check failed",
  "not-recorded": "Not recorded by the service",
  "operation-conflict": "Request not accepted",
  "unknown-announcement": "Request not accepted",
  "invalid-request": "Request not sent",
  unexpected: "Communication problem",
};

/** Status panel heading. */
export const VIEW_HEADING: Record<PublicationKind, string> = {
  restoring: "Restoring publication history",
  "history-unavailable": "Publication history unavailable",
  "not-submitted": "Ready when you are",
  submitting: "Sending your announcement",
  processing: "Publication in progress",
  published: "Successfully published",
  rejected: "Publication was declined",
  unconfirmed: "Let’s confirm what happened",
};

export const VIEW_ICON: Record<PublicationKind, IconName> = {
  restoring: "refresh",
  "history-unavailable": "alert",
  "not-submitted": "document",
  submitting: "send",
  processing: "clock",
  published: "check",
  rejected: "close",
  unconfirmed: "alert",
};

interface IssueCopy {
  /** What happened. */
  what: string;
  /** Whether the publication outcome is known. */
  outcome: string;
  /** What the user can do next. */
  next: string;
}

/**
 * User-facing wording for every request problem. Each entry answers the same three questions:
 * what happened, is the publication outcome known, and what can I do about it.
 * `hasKnownStatus` says whether the service has ever confirmed anything about the operation;
 * `automatic` whether automatic status checks are currently running.
 */
export const describeIssue = (issue: Issue, hasKnownStatus: boolean, automatic = false): IssueCopy => {
  const unknown = hasKnownStatus
    ? "The last confirmed status is shown, but it may be out of date."
    : "The outcome is unknown: the service may have accepted this publication.";
  switch (issue.kind) {
    case "response-lost":
      return {
        what: "The publish request was sent but its response never arrived.",
        outcome: unknown,
        next: "Check the status, or resend the request. Resending reuses the same operation ID, so it cannot create a duplicate.",
      };
    case "status-unavailable":
      return {
        what: "The service could not report the status right now.",
        outcome: `${unknown} This is not a rejection.`,
        next: automatic
          ? "We keep retrying automatically. You can also check again now."
          : "Automatic checks are not running right now. Use Check status to try again.",
      };
    case "not-recorded":
      return {
        what: "The service has no record of this operation.",
        outcome: hasKnownStatus
          ? "The last confirmed status is kept, but the service no longer reports it."
          : "The request may never have arrived. Nothing is confirmed either way.",
        next: hasKnownStatus ? "Check again later." : "Resend the request (same operation ID) or check again.",
      };
    case "operation-conflict":
      return {
        what: "The service says this operation ID already belongs to another announcement.",
        outcome: "Nothing was published by this attempt.",
        next: "This is a consistency error. Reload the page; if it persists, report it. You can then start a new attempt.",
      };
    case "unknown-announcement":
      return {
        what: "The service does not recognise this announcement.",
        outcome: "Nothing was published by this attempt.",
        next: "Reload the page to refresh the announcement list.",
      };
    case "invalid-request":
      return {
        what: "The request was not sent because an ID is not valid.",
        outcome: "Nothing was published by this attempt.",
        next: "This is a bug in the application. Reload the page and report it.",
      };
    case "unexpected":
      return {
        what: "An unexpected error occurred while talking to the service.",
        outcome: unknown,
        next: "Check the status first. You can also resend: it reuses the same operation ID, so it cannot create a duplicate.",
      };
  }
};
