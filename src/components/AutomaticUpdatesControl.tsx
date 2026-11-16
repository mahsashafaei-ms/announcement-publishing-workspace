import type { AutomaticUpdates } from "../controller/workspaceController";
import { Icon } from "./ui/Icon";

const describeAutomaticUpdates = ({ enabled, online, visible }: AutomaticUpdates): string => {
  if (!enabled) return "Automatic checks are off. Use Check status or Retry loading when needed.";
  if (!online) return "Automatic checks are paused while offline. They resume when the connection returns.";
  if (!visible) return "Automatic checks are paused while this tab is in the background.";
  return "Pending publications update automatically. Checks only read status; they never publish. You can check manually at any time.";
};

/** The user's preference. Temporary availability (hidden tab, offline) only changes the description. */
export function AutomaticUpdatesControl({
  value,
  onChange,
}: {
  value: AutomaticUpdates;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <div className="mb-4.5 flex flex-col items-stretch gap-1.25 rounded-card border border-line bg-tools px-3.75 py-3.25 sm:flex-row sm:items-center sm:justify-between sm:gap-5 sm:px-4.5 sm:py-3.75">
      <div className="flex items-start gap-2.5">
        <Icon name="refresh" className="mt-0.75 size-4 text-accent-tint" />
        <div>
          <strong className="block text-sm font-strong">Stay up to date</strong>
          <p id="sync-description" aria-live="polite" className="mt-0.75 text-2xs leading-[1.8] text-muted sm:text-xs">
            {describeAutomaticUpdates(value)}
          </p>
        </div>
      </div>
      <button
        className="group inline-flex min-h-11 shrink-0 items-center gap-2.25 self-start rounded-[5px] py-2 pl-6.5 text-2xs font-medium sm:self-auto sm:pl-2 sm:text-xs"
        type="button"
        role="switch"
        aria-checked={value.enabled}
        aria-describedby="sync-description"
        onClick={() => onChange(!value.enabled)}
      >
        <span
          className="h-4.75 w-8 rounded-xl border border-transparent bg-muted p-0.75 transition-colors duration-150 group-aria-checked:bg-accent forced-colors:border-[ButtonText]"
          aria-hidden="true"
        >
          <span className="block size-2.75 rounded-full bg-white transition-transform duration-150 group-aria-checked:translate-x-3.25 forced-colors:bg-[ButtonText]" />
        </span>
        <span>Automatic updates</span>
      </button>
    </div>
  );
}
