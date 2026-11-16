import type { PublishBlockReason, PublicationView } from "../../domain/selectors";
import { canCheck, canResend } from "../../domain/selectors";
import { isUnresolved } from "../../domain/types";
import { Icon } from "../ui/Icon";
import { Button, Spinner } from "../ui/primitives";

interface PublicationActionsProps {
  view: PublicationView;
  /** Why a new attempt is not allowed right now (from `canStartAttempt`), or null if it is. */
  blockReason: PublishBlockReason | null;
  automatic: boolean;
  onPublish: () => void;
  onCheckStatus: (operationId: string) => void;
  onResend: (operationId: string) => void;
}

const BLOCK_HINT: Record<PublishBlockReason, string | null> = {
  "announcements-unavailable": "Announcements must load before a publication can begin.",
  "recovery-incomplete":
    "Publication history must be restored before a new attempt can begin, so nothing is published twice.",
  "already-published": null,
  "attempt-unresolved": null,
};

function hintFor(view: PublicationView, automatic: boolean): string {
  switch (view.kind) {
    case "published":
      return "Publication complete. This announcement cannot be published again.";
    case "rejected":
      return "A new attempt gets its own operation ID and history entry.";
    case "not-submitted":
    case "restoring":
    case "history-unavailable":
      return "Your prepared content will be sent to the publishing service.";
    default:
      return automatic
        ? "Automatic checks continue until an outcome is confirmed. You can keep working."
        : "Automatic checks are paused. Use Check status for the latest result.";
  }
}

// Full-width buttons on phones, natural width from the tablet layout up.
const buttonWidth = "flex-[1_1_180px] sm:flex-none";

/**
 * The buttons for one announcement. Which buttons are enabled comes from the domain rules
 * (`canStartAttempt`, `canCheck`, `canResend`); the controller enforces the same rules again.
 */
export function PublicationActions({
  view,
  blockReason,
  automatic,
  onPublish,
  onCheckStatus,
  onResend,
}: PublicationActionsProps) {
  const attempt = "attempt" in view ? view.attempt : null;
  const hint = (blockReason && BLOCK_HINT[blockReason]) ?? hintFor(view, automatic);

  return (
    <div className="mt-5">
      <div className="flex flex-wrap gap-2.5">
        {attempt && isUnresolved(attempt) ? (
          <>
            <Button
              variant="primary"
              className={buttonWidth}
              disabled={!canCheck(attempt)}
              aria-busy={attempt.checking}
              onClick={() => onCheckStatus(attempt.operationId)}
            >
              {attempt.checking ? (
                <>
                  <Spinner />
                  Checking status…
                </>
              ) : (
                <>
                  <Icon name="refresh" />
                  Check status
                </>
              )}
            </Button>
            {canResend(attempt) && (
              <Button variant="secondary" className={buttonWidth} onClick={() => onResend(attempt.operationId)}>
                <Icon name="send" />
                Resend publish request
              </Button>
            )}
          </>
        ) : (
          <Button variant="primary" className={buttonWidth} disabled={blockReason !== null} onClick={onPublish}>
            <Icon name={view.kind === "published" ? "check" : "send"} />
            {view.kind === "published"
              ? "Published"
              : view.kind === "rejected"
                ? "Start a new attempt"
                : "Publish announcement"}
          </Button>
        )}
      </div>
      <p className="mt-2.5 text-2xs text-muted">{hint}</p>
    </div>
  );
}
