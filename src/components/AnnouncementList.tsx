import type { IAnnouncement } from "../mocks";
import type { PublicationView } from "../domain/selectors";
import { Icon } from "./ui/Icon";
import { StatusBadge } from "./StatusBadge";
import { Count, Spinner, cx } from "./ui/primitives";

interface Props {
  announcements: IAnnouncement[];
  views: ReadonlyMap<string, PublicationView>;
  loading: boolean;
  selectedId: string | undefined;
  onSelect: (id: string) => void;
}

export function AnnouncementList({ announcements, views, loading, selectedId, onSelect }: Props) {
  return (
    <nav
      className="rounded-panel border border-line bg-panel px-3 pt-4.25 pb-3.25 sm:px-3.5 sm:pt-5.75 sm:pb-4.25 md:sticky md:top-5 md:pb-5"
      aria-label="Announcements"
      aria-busy={loading}
    >
      <div className="flex items-center justify-between px-2">
        <h2 className="text-lg font-semibold">Announcements</h2>
        <Count>{loading ? "—" : announcements.length}</Count>
      </div>
      <p className="mx-2 mt-1.25 mb-3.25 text-2xs text-muted sm:mb-4.75 sm:text-xs">Choose an announcement to review</p>
      {loading && (
        <div className="flex items-center gap-2 px-2.25 py-5 text-sm text-muted" role="status">
          <Spinner />
          Loading announcements…
        </div>
      )}
      {!loading && announcements.length === 0 && (
        <p className="px-2.25 py-5 text-sm text-muted">No prepared announcements available.</p>
      )}
      {/* One column on phones, three across on tablets, one column beside the details. */}
      <ul className="grid gap-1.75 sm:grid-cols-3 sm:gap-2 md:grid-cols-1 md:gap-2.5">
        {announcements.map((announcement, index) => {
          const selected = announcement.id === selectedId;
          const view = views.get(announcement.id);
          return (
            <li key={announcement.id} className="sm:flex md:block">
              <button
                type="button"
                className={cx(
                  "relative grid w-full grid-cols-[1fr_auto] gap-x-3 rounded-card border px-3.25 py-3 text-left transition-[background-color,border-color,box-shadow] duration-150 sm:flex sm:h-full sm:flex-col sm:items-stretch sm:p-3 md:h-auto md:p-3.5 lg:p-4 forced-colors:border-[ButtonText]",
                  selected
                    ? "border-line-active bg-surface shadow-card before:absolute before:inset-y-4 before:-left-px before:w-0.75 before:rounded-r-[3px] before:bg-accent-tint"
                    : "border-line hover:border-line-active hover:bg-sunken",
                )}
                aria-current={selected ? "true" : undefined}
                aria-controls="announcement-details"
                onClick={() => onSelect(announcement.id)}
              >
                <span className="col-start-1 flex min-w-0 items-center gap-2.5 text-muted">
                  <span className="hidden text-2xs font-heavy md:inline">{String(index + 1).padStart(2, "0")}</span>
                  <span className="font-mono text-2xs [overflow-wrap:anywhere]">{announcement.id}</span>
                  <Icon name="chevron" className={cx("ml-auto hidden size-3.5 sm:block", !selected && "opacity-0")} />
                </span>
                <span className="col-start-1 mt-1.25 text-md leading-normal font-semibold [overflow-wrap:anywhere] sm:mt-2.75 md:text-base lg:text-lg">
                  {announcement.title}
                </span>
                <span className="mt-1.75 hidden text-2xs leading-[1.75] text-muted sm:line-clamp-2 md:text-xs">
                  {announcement.body}
                </span>
                <span className="col-start-2 row-span-2 row-start-1 flex items-center justify-between gap-2 self-center sm:mt-auto sm:self-auto sm:pt-3 md:mt-4 md:pt-0">
                  {view && <StatusBadge kind={view.kind} />}
                  {selected && <span className="hidden text-3xs text-muted lg:inline">Selected</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mx-2 mt-5 hidden items-start gap-2.25 border-t border-line pt-4.25 text-accent-tint md:flex">
        <Icon name="shield" className="mt-0.5 size-4" />
        <p className="text-xs leading-[1.8] font-strong">
          Work at your own pace.
          <br />
          <span className="font-normal text-muted">
            You can switch announcements while another publication is in progress.
          </span>
        </p>
      </div>
    </nav>
  );
}
