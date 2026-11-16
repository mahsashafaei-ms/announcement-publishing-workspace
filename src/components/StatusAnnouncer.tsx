import { useEffect, useState } from "react";
import type { IAnnouncement } from "../mocks";
import type { PublicationView } from "../domain/selectors";
import { describeChanges, signalsKey, toSignals } from "./statusSignals";
import type { StatusSignals } from "./statusSignals";

/** Time between clearing the region and writing the new text, so they are two separate DOM updates. */
const REPOPULATE_DELAY_MS = 100;

interface StatusAnnouncerProps {
  announcements: readonly IAnnouncement[];
  views: ReadonlyMap<string, PublicationView>;
  /** Announcements and history are both loaded. Before that nothing is announced. */
  ready: boolean;
}

/** Changes collected since the start of the pending announcement. */
interface PendingAnnouncement {
  before: StatusSignals;
  text: string;
}

/**
 * A polite live region for publication events: confirmed outcomes, "Outcome unconfirmed",
 * and new request problems, including ones that do not change the publication state.
 *
 * Detection compares the announceable signals with the previous render ("adjust state while
 * rendering"), so ordinary renders never create an event. Pending changes share one starting
 * snapshot: independent outcomes are combined, while a newer result replaces an obsolete issue
 * for the same announcement. The region is emptied before a later update writes the text, so
 * distinct failures with identical wording still change its content. Reset and unmount cancel
 * the pending write.
 */
export function StatusAnnouncer({ announcements, views, ready }: StatusAnnouncerProps) {
  const signals = toSignals(announcements, views, ready);
  const key = signalsKey(signals);
  const [previous, setPrevious] = useState<{ key: string; signals: StatusSignals }>({ key, signals });
  const [pending, setPending] = useState<PendingAnnouncement | null>(null);
  const [message, setMessage] = useState("");

  if (previous.key !== key) {
    const before = pending?.before ?? previous.signals;
    const text = describeChanges(before, signals);
    setPrevious({ key, signals });
    setMessage("");
    setPending(text ? { before, text } : null);
  }

  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => {
      setMessage(pending.text);
      setPending(null);
    }, REPOPULATE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [pending]);

  return (
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {message}
    </div>
  );
}
