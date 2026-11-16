export type IconName = keyof typeof paths;

const paths = {
  announce: "m4 10 12-5v14L4 14Zm0 0H2v4h2m4 2 1 5h3l-2-4M20 8v8",
  arrow: "M5 12h14m-6-6 6 6-6 6",
  check: "m5 12 4 4L19 6",
  clock: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  alert: "M12 8v5m0 3h.01M10.3 4.2 2.2 18.3A1.8 1.8 0 0 0 3.8 21h16.4a1.8 1.8 0 0 0 1.6-2.7L13.7 4.2a2 2 0 0 0-3.4 0",
  refresh: "M20 8a8 8 0 1 0 0 8m0-13v5h-5",
  document: "M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Zm0 0v6h6M8 13h8m-8 4h5",
  chevron: "m9 5 7 7-7 7",
  close: "m6 6 12 12M6 18 18 6",
  shield: "m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Zm-4 9 3 3 5-6",
  send: "m22 2-7 20-4-9-9-4Zm0 0L11 13",
} as const;

/** `className` must include a size (default 19px) and may add colour or spacing. */
export function Icon({ name, className = "size-4.75" }: { name: IconName; className?: string }) {
  return (
    <svg
      className={`block shrink-0 ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
