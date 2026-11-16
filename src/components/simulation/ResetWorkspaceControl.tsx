import { useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../ui/Icon";
import { Button } from "../ui/primitives";
import { ResetDialog } from "./ResetDialog";

interface ResetWorkspaceControlProps {
  /** Resets the service and reloads the workspace. Rejects, changing nothing, if the service reset fails. */
  onReset: () => Promise<void>;
  /** Called after a successful reset (e.g. to re-read the restored scenario). */
  onResetComplete: () => void;
  /** Lets the page behind the dialog become inert while it is open. */
  onDialogChange: (open: boolean) => void;
}

/** The "Reset workspace" button and its confirmation flow: open, confirm, pending, error. */
export function ResetWorkspaceControl({ onReset, onResetComplete, onDialogChange }: ResetWorkspaceControlProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (next: boolean) => {
    setOpen(next);
    setError(null);
    onDialogChange(next);
  };

  const confirm = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await onReset();
    } catch {
      // service.reset() threw: nothing was cleared, the dialog stays open for another try.
      setError("The simulation could not be reset. Your workspace was not changed. Please try again.");
      setPending(false);
      return;
    }
    setPending(false);
    toggle(false);
    onResetComplete();
  };

  return (
    <div className="border-t border-line pt-4.5 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-7.5">
      <h3 className="text-sm font-strong">Start with a clean workspace</h3>
      <p className="mt-1.25 text-xs text-muted">Reset all attempts, publication history and the selected scenario.</p>
      <Button variant="secondary" className="mt-3.25" onClick={() => toggle(true)}>
        <Icon name="refresh" />
        Reset workspace
      </Button>
      {/* Rendered into <body> so the inert page behind the modal never contains the modal itself. */}
      {open &&
        createPortal(
          <ResetDialog
            pending={pending}
            error={error}
            onCancel={() => toggle(false)}
            onConfirm={() => void confirm()}
          />,
          document.body,
        )}
    </div>
  );
}
