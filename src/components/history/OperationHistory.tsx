import type { OperationRecord, RecoveryState } from "../../domain/types";
import { Icon } from "../ui/Icon";
import { Count, Eyebrow } from "../ui/primitives";
import { OperationHistoryItem } from "./OperationHistoryItem";

interface OperationHistoryProps {
  /** Attempts in chronological order (oldest first). */
  attempts: OperationRecord[];
  currentOperationId: string | null;
  recovery: RecoveryState;
}

function EmptyHistory({ title, detail, icon = false }: { title: string; detail: string; icon?: boolean }) {
  return (
    <div className="mt-5 flex items-center gap-2.5 rounded-lg border border-dashed border-line px-3 py-3.75 sm:gap-3.25 sm:px-4.25 sm:py-4.75">
      {icon && (
        <span className="rounded-full bg-accent-soft p-2.25 text-muted">
          <Icon name="clock" className="size-4.25" />
        </span>
      )}
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.75 text-2xs text-muted sm:text-xs">{detail}</p>
      </div>
    </div>
  );
}

/**
 * Every known attempt for one announcement, newest first. An empty list only means "no attempts"
 * once recovery has succeeded; before that the service may hold attempts we have not read.
 */
export function OperationHistory({ attempts, currentOperationId, recovery }: OperationHistoryProps) {
  const known = recovery.status === "ready";
  return (
    <section
      className="border-t border-line bg-surface px-4.75 py-5.25 sm:px-7 sm:py-6 md:px-6 md:pb-6.75 lg:px-7.5 xl:px-9 xl:pt-6.5 xl:pb-7.5"
      aria-labelledby="history-heading"
    >
      <div className="flex items-center justify-between gap-3.75">
        <div>
          <Eyebrow className="mb-1.25">A record of every attempt</Eyebrow>
          <h3 id="history-heading" className="flex items-center gap-2.5 font-strong">
            Publication history <Count small>{known ? attempts.length : "—"}</Count>
          </h3>
        </div>
        <Icon name="clock" className="size-4.5 text-muted" />
      </div>

      {!known && (
        <EmptyHistory
          title={recovery.status === "failed" ? "History unavailable" : "Restoring history"}
          detail={
            attempts.length > 0
              ? "The attempts below are known; others may appear once publication history is restored."
              : "Existing attempts will appear after publication history is restored."
          }
        />
      )}
      {known && attempts.length === 0 && (
        <EmptyHistory
          title="No attempts yet"
          detail="Your publication attempts and their outcomes will appear here."
          icon
        />
      )}
      {attempts.length > 0 && (
        <ol className="mt-5.75 ml-1 min-w-0 [overflow-wrap:anywhere]">
          {attempts
            .map((attempt, index) => ({ attempt, number: index + 1 }))
            .reverse()
            .map(({ attempt, number }) => (
              <OperationHistoryItem
                key={attempt.operationId}
                attempt={attempt}
                number={number}
                current={attempt.operationId === currentOperationId}
              />
            ))}
        </ol>
      )}
    </section>
  );
}
