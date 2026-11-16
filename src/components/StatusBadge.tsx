import type { PublicationKind } from "../domain/selectors";
import { VIEW_ICON, VIEW_LABEL } from "./format";
import { Icon } from "./ui/Icon";
import { badgeTone, kindTone } from "./ui/tones";
import { cx } from "./ui/primitives";

export function StatusBadge({ kind }: { kind: PublicationKind }) {
  return (
    <span
      className={cx(
        "inline-flex max-w-28 items-center gap-1.25 rounded-[5px] px-1.5 py-1.25 text-3xs leading-[1.4] font-strong sm:max-w-none sm:px-2 sm:text-2xs sm:whitespace-nowrap forced-colors:border forced-colors:border-[ButtonText] [&_svg]:size-2.75 [&_svg]:stroke-2 sm:[&_svg]:size-3",
        badgeTone[kindTone[kind]],
      )}
    >
      <Icon name={VIEW_ICON[kind]} />
      {VIEW_LABEL[kind]}
    </span>
  );
}
