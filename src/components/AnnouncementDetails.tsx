import type { IAnnouncement } from "../mocks";
import type { PublicationCommands } from "../controller/workspaceController";
import type { PublishBlockReason, PublicationView } from "../domain/selectors";
import type { OperationRecord, RecoveryState } from "../domain/types";
import { OperationHistory } from "./history/OperationHistory";
import { PublicationPanel } from "./publication/PublicationPanel";
import { Icon } from "./ui/Icon";
import { Eyebrow, cx } from "./ui/primitives";

const panel = "min-w-0 overflow-clip rounded-panel border border-line bg-surface shadow-card [overflow-wrap:anywhere]";

interface AnnouncementDetailsProps {
  announcement: IAnnouncement;
  view: PublicationView;
  attempts: OperationRecord[];
  recovery: RecoveryState;
  blockReason: PublishBlockReason | null;
  automatic: boolean;
  commands: PublicationCommands;
}

export function AnnouncementDetails({
  announcement,
  view,
  attempts,
  recovery,
  blockReason,
  automatic,
  commands,
}: AnnouncementDetailsProps) {
  return (
    <section className={panel} id="announcement-details" aria-labelledby="announcement-title">
      <div className="px-4.75 py-5.5 sm:p-7 md:px-6 md:pb-6 lg:px-7.5 xl:px-9 xl:pt-8 xl:pb-6.5">
        <div className="flex items-center justify-between gap-3">
          <Eyebrow as="span">
            <Icon name="document" />
            Announcement details
          </Eyebrow>
          <span className="rounded-sm border border-line bg-sunken px-2 py-0.75 font-mono text-2xs text-muted">
            {announcement.id}
          </span>
        </div>
        <h2
          id="announcement-title"
          className="mt-4.25 mb-5 text-[25px] leading-[1.35] font-medium tracking-[-0.7px] sm:mb-5.75 sm:text-3xl"
        >
          {announcement.title}
        </h2>
        <article
          className="rounded-card border border-line bg-sunken px-4 pt-3.75 sm:px-4.5 sm:pt-4.5 lg:px-5.5"
          aria-label="Prepared content"
        >
          <div className="flex items-center justify-between gap-2.5">
            <Eyebrow as="span">Announcement text</Eyebrow>
            <span className="text-3xs text-muted sm:text-2xs">Fixed</span>
          </div>
          <p className="mt-4 mb-5.5 text-base leading-[1.9] whitespace-pre-wrap sm:text-lg sm:leading-[1.95]">
            {announcement.body}
          </p>
          <div className="flex items-center gap-1.75 border-t border-line py-2.75 text-2xs text-muted">
            <Icon name="check" className="size-3.25" />
            <span>Prepared content · Read only</span>
          </div>
        </article>
        <PublicationPanel
          announcementId={announcement.id}
          view={view}
          blockReason={blockReason}
          automatic={automatic}
          commands={commands}
        />
      </div>
      <OperationHistory
        attempts={attempts}
        currentOperationId={"attempt" in view ? view.attempt.operationId : null}
        recovery={recovery}
      />
    </section>
  );
}

/** Shown in place of the details while announcements are loading, failed or empty. */
export function EmptyDetails({ status }: { status: "loading" | "failed" | "ready" }) {
  return (
    <section
      className={cx(panel, "min-h-80 px-5 py-12.5 text-center sm:min-h-112.5 sm:px-7.5 sm:py-17.5")}
      id="announcement-details"
      aria-label="Announcement details"
    >
      <span className="mx-auto mb-5.5 grid size-17.5 place-items-center rounded-[20px] bg-accent-soft text-accent-tint">
        <Icon name="document" className="size-7.75" />
      </span>
      <Eyebrow className="justify-center">Your workspace</Eyebrow>
      <h2 className="mb-3.25 text-[23px] font-medium tracking-[-0.7px]">
        {status === "failed"
          ? "Waiting for announcements"
          : status === "ready"
            ? "Nothing to publish yet"
            : "Getting things ready…"}
      </h2>
      <p className="text-sm text-muted">Prepared content and publication history will appear here.</p>
    </section>
  );
}
