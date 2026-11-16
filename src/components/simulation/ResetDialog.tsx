import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "../ui/Icon";
import { Button, Eyebrow, Spinner } from "../ui/primitives";

/**
 * Modal confirmation. The page behind it is made `inert` by the parent; this component focuses
 * Cancel first, keeps Tab inside the dialog, closes on Escape (unless a reset is running) and
 * gives focus back to the element that opened it.
 */
export function ResetDialog({
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  // Captured during the first render, before the commit makes the page inert: a browser moves focus
  // out of an inert subtree, so reading document.activeElement in an effect would only find <body>.
  const [opener] = useState(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null));
  // The keyboard handler is installed once; it reads the latest props through refs.
  const latest = useRef({ onCancel, pending });
  useLayoutEffect(() => {
    latest.current = { onCancel, pending };
  }, [onCancel, pending]);
  // Both buttons are disabled while pending, so keep focus on the dialog itself.
  useLayoutEffect(() => {
    if (pending) dialog.current?.focus();
  }, [pending]);

  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cancel.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !latest.current.pending) {
        event.preventDefault();
        latest.current.onCancel();
        return;
      }
      if (event.key !== "Tab") return;
      const buttons = dialog.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
      const first = buttons?.[0];
      const last = buttons?.[buttons.length - 1];
      if (!first || !last) {
        event.preventDefault();
        dialog.current?.focus();
      } else if (!dialog.current?.contains(document.activeElement) || document.activeElement === dialog.current) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      if (opener?.isConnected) opener.focus();
    };
  }, [opener]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#142a20a6] p-4.5 backdrop-blur-[3px] sm:p-6">
      <div
        ref={dialog}
        tabIndex={-1}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="reset-title"
        aria-describedby="reset-description"
        aria-busy={pending}
        className="w-110 max-w-full rounded-2xl border border-line bg-surface p-6 shadow-dialog [overflow-wrap:anywhere] sm:p-7.5"
      >
        <span className="mb-5.5 grid size-11.5 place-items-center rounded-xl bg-danger-soft text-danger">
          <Icon name="refresh" className="size-5.5" />
        </span>
        <Eyebrow>Simulation only</Eyebrow>
        <h2 id="reset-title" className="mt-1.75 mb-3.5 text-2xl font-medium tracking-[-0.6px]">
          Reset the workspace?
        </h2>
        <p id="reset-description" className="text-md leading-[1.9] text-muted">
          This clears all simulated publication attempts and history. Every announcement will return to Not submitted
          and the scenario will return to Success. Nothing is published again.
        </p>
        {error && (
          <p className="mt-4 rounded-md border border-danger-line bg-danger-panel p-3 text-danger" role="alert">
            {error}
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-end gap-2.5">
          <Button ref={cancel} variant="secondary" disabled={pending} onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" disabled={pending} onClick={onConfirm}>
            {pending ? (
              <>
                <Spinner />
                Resetting…
              </>
            ) : (
              "Reset all attempts"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
