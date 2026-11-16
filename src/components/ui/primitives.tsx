import type { ComponentProps, ReactNode } from "react";
import { Icon } from "./Icon";

/** Joins class names, skipping falsy values. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

// Each variant sets its own border colour: two utilities for the same property would be
// resolved by stylesheet order, not by their order in className.
const buttonVariants = {
  primary:
    "border-transparent bg-accent text-white shadow-button enabled:hover:bg-accent-hover disabled:bg-accent-soft disabled:text-muted disabled:shadow-none",
  secondary: "border-line-strong bg-surface text-accent enabled:hover:border-accent-tint enabled:hover:bg-accent-soft",
  danger: "border-transparent bg-danger-solid text-white enabled:hover:bg-danger-solid-hover",
} as const;

export function Button({
  variant,
  className,
  ...props
}: ComponentProps<"button"> & { variant: keyof typeof buttonVariants }) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex min-h-11 items-center justify-center gap-2.25 rounded-[7px] border px-4 py-2.5 text-sm leading-normal font-strong transition-colors duration-150 disabled:opacity-80 forced-colors:border-[ButtonText] [&_svg]:size-4",
        buttonVariants[variant],
        className,
      )}
    />
  );
}

export function Spinner() {
  return (
    <span
      className="inline-block size-3.75 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent"
      aria-hidden="true"
    />
  );
}

/** The small uppercase label above headings and inside panels. */
export function Eyebrow({
  as: Tag = "p",
  className,
  children,
}: {
  as?: "p" | "span";
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag
      className={cx(
        "flex items-center gap-1.75 text-3xs font-heavy tracking-[0.1em] text-muted uppercase sm:text-2xs [&_svg]:size-3.5",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

/** A small numeric chip, e.g. the number of announcements or attempts. */
export function Count({ children, small = false }: { children: ReactNode; small?: boolean }) {
  return (
    <span
      className={cx(
        "inline-grid place-items-center rounded-md border border-line bg-sunken font-medium text-muted",
        small ? "h-5 min-w-5 text-2xs" : "h-6 min-w-6 text-xs",
      )}
    >
      {children}
    </span>
  );
}

/** A warning callout with an optional action, used for load and integrity problems. */
export function Alert({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div
      role="alert"
      className="mb-4.5 flex flex-wrap items-start gap-2.5 rounded-card border border-warning-line bg-warning-panel p-4 text-warning sm:flex-nowrap sm:gap-3.25 sm:px-5.5 sm:py-4.75"
    >
      <Icon name="alert" className="mt-0.5 size-4.75" />
      <div className="min-w-50 flex-1 text-xs [overflow-wrap:anywhere] sm:min-w-0 [&_p]:mt-1">
        <strong className="text-sm">{title}</strong>
        {children}
      </div>
      {action && <div className="ml-7 sm:ml-0">{action}</div>}
    </div>
  );
}
