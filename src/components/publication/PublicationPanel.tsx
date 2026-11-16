import type { PublicationCommands } from "../../controller/workspaceController";
import type { PublishBlockReason, PublicationView } from "../../domain/selectors";
import { PublicationActions } from "./PublicationActions";
import { PublicationStatusCard } from "./PublicationStatusCard";

interface PublicationPanelProps {
  announcementId: string;
  view: PublicationView;
  blockReason: PublishBlockReason | null;
  /** Automatic status checks are running right now (switch on, tab visible, online). */
  automatic: boolean;
  commands: PublicationCommands;
}

/** Status, integrity warning and actions for the selected announcement. */
export function PublicationPanel({ announcementId, view, blockReason, automatic, commands }: PublicationPanelProps) {
  const integrityNote = "attempt" in view ? view.attempt.integrityNote : null;
  return (
    <>
      <PublicationStatusCard view={view} automatic={automatic} />
      {integrityNote && (
        <p
          className="mt-4.5 rounded-card border border-warning-line bg-warning-panel p-4 text-xs text-warning [overflow-wrap:anywhere]"
          role="alert"
        >
          <strong>Inconsistent service response.</strong> {integrityNote} The first confirmed result was kept.
        </p>
      )}
      <PublicationActions
        view={view}
        blockReason={blockReason}
        automatic={automatic}
        onPublish={() => void commands.publish(announcementId)}
        onCheckStatus={(operationId) => void commands.checkStatus(operationId)}
        onResend={(operationId) => void commands.resend(operationId)}
      />
    </>
  );
}
