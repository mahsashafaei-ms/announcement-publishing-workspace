import type { WorkspaceSummary } from "../domain/selectors";
import { Icon } from "./ui/Icon";
import { Eyebrow } from "./ui/primitives";

function StatusDot() {
  return (
    <span
      className="inline-block size-1.25 shrink-0 rounded-full bg-accent-tint sm:size-1.5 forced-colors:bg-[ButtonText]"
      aria-hidden="true"
    />
  );
}

export function WorkspaceHeader() {
  return (
    <header className="flex h-20.75 items-center justify-between gap-2.5 border-b border-line sm:h-25 sm:gap-5">
      <div className="flex items-center gap-2.25 text-3xs font-heavy tracking-[0.13em] sm:gap-3.25 sm:text-2xs">
        <span className="grid size-9 place-items-center rounded-[10px] bg-accent text-white shadow-button sm:size-11 sm:rounded-panel">
          <Icon name="announce" className="size-5.25 sm:size-6" />
        </span>
        <span>
          COMMUNICATIONS
          <span className="mt-0.5 block text-2xs font-book tracking-normal text-muted sm:text-sm">
            Publishing workspace
          </span>
        </span>
      </div>
      <span className="flex items-center gap-1.25 rounded-full border border-line px-2 py-1.25 text-3xs text-muted sm:gap-2 sm:px-3 sm:py-1.5 sm:text-xs">
        <StatusDot />
        Simulated service
      </span>
    </header>
  );
}

export type WorkspaceStatus = "ready" | "loading" | "attention";

/**
 * Title, published counter and the one-line workspace status. Every number comes from
 * `selectSummary`, which returns null (shown as "—") while the information is unknown.
 */
export function WorkspaceIntro({ summary, status }: { summary: WorkspaceSummary; status: WorkspaceStatus }) {
  const { published, inProgress, total } = summary;
  const progress = published !== null && total ? (published / total) * 100 : 0;
  return (
    <>
      <div className="flex items-center justify-between gap-5 pt-7 pb-6.5 sm:pt-10.5 sm:pb-8.5 lg:gap-8 xl:pt-12 xl:pb-10">
        <div>
          <Eyebrow className="mb-2.25">Your publishing desk</Eyebrow>
          <h1 className="text-[30px] leading-[1.2] font-medium tracking-[-1.1px] sm:text-[32px] sm:tracking-[-1.5px] md:text-[clamp(28px,3.4vw,40px)]">
            Announcement workspace
          </h1>
          <p className="mt-3 max-w-75 text-sm leading-[1.8] text-muted sm:max-w-none sm:leading-[inherit] md:text-md">
            Review your announcements and follow every publication.
          </p>
        </div>
        <div className="hidden min-w-38.75 border-l border-line pl-5.5 sm:block md:min-w-41.25 lg:min-w-47.5 lg:pl-7.5">
          <div className="flex items-baseline gap-2.5 leading-[1.1]">
            <strong className="text-[31px] font-book tracking-[-1.5px] md:text-4xl">
              {published === null ? "—" : String(published).padStart(2, "0")}
            </strong>
            <span className="text-xl text-muted">/ {total ?? "—"}</span>
          </div>
          <p className="mt-2.25 mb-2.5 text-xs text-muted">announcements published</p>
          <div className="h-0.75 w-37.5 overflow-hidden rounded-[5px] bg-accent-soft" aria-hidden="true">
            <span
              className="block h-full bg-accent transition-[width] duration-250"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      <div className="flex items-start justify-between gap-4 border-t border-line py-3.75 text-2xs text-muted sm:items-center sm:text-xs">
        <div className="flex items-center gap-2">
          <StatusDot />
          <span>
            {status === "ready"
              ? "Workspace ready"
              : status === "loading"
                ? "Restoring workspace…"
                : "Workspace needs attention"}
          </span>
        </div>
        <span className="max-w-35 text-right sm:max-w-none">
          {inProgress === null
            ? status === "attention"
              ? "Publication history unknown"
              : "Preparing your announcements"
            : inProgress > 0
              ? `${inProgress} ${inProgress === 1 ? "publication" : "publications"} in progress`
              : "No publications awaiting confirmation"}
        </span>
      </div>
    </>
  );
}

export function WorkspaceFooter() {
  return (
    <footer className="flex flex-col items-start justify-between gap-2 px-0.5 py-5 text-3xs text-muted sm:flex-row sm:gap-5 sm:px-0 sm:pt-5.75 sm:pb-6.25 sm:text-2xs md:items-center">
      <span className="flex items-center gap-1.75">
        <Icon name="shield" className="size-3.25" />
        History is recoverable after refresh in this tab.
      </span>
      <span>One announcement. One successful publication.</span>
    </footer>
  );
}
