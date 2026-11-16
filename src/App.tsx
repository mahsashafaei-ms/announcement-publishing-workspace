import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { IAnnouncement, IAnnouncementService } from "./mocks";
import { createWorkspaceController, isAutomaticActive } from "./controller/workspaceController";
import {
  canStartAttempt,
  isWorkspaceReady,
  selectAttempts,
  selectPublicationView,
  selectSummary,
} from "./domain/selectors";
import type { PublicationView } from "./domain/selectors";
import { AnnouncementDetails, EmptyDetails } from "./components/AnnouncementDetails";
import { AnnouncementList } from "./components/AnnouncementList";
import { AutomaticUpdatesControl } from "./components/AutomaticUpdatesControl";
import { SimulationSettings } from "./components/simulation/SimulationSettings";
import { StatusAnnouncer } from "./components/StatusAnnouncer";
import { WorkspaceFooter, WorkspaceHeader, WorkspaceIntro } from "./components/WorkspaceHeader";
import type { WorkspaceStatus } from "./components/WorkspaceHeader";
import { describeIssue } from "./components/format";
import { Alert, Button } from "./components/ui/primitives";

const NO_ANNOUNCEMENTS: IAnnouncement[] = [];
const shell = "mx-auto max-w-316 px-4.5 sm:px-7 lg:px-10";

const readAvailability = () => ({ online: navigator.onLine, visible: document.visibilityState !== "hidden" });

export function App({ service }: { service: IAnnouncementService }) {
  const [controller] = useState(() => createWorkspaceController({ service }));
  const state = useSyncExternalStore(controller.subscribe, controller.getState);
  const automaticUpdates = useSyncExternalStore(controller.subscribe, controller.getAutomaticUpdates);
  const automatic = isAutomaticActive(automaticUpdates);
  const [selectedId, setSelectedId] = useState<string>();
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    // Browser availability is reported separately from the user's switch, which it never changes.
    const updateAvailability = () => controller.setAvailability(readAvailability());
    updateAvailability();
    document.addEventListener("visibilitychange", updateAvailability);
    window.addEventListener("online", updateAvailability);
    window.addEventListener("offline", updateAvailability);
    controller.start();
    return () => {
      controller.stop();
      document.removeEventListener("visibilitychange", updateAvailability);
      window.removeEventListener("online", updateAvailability);
      window.removeEventListener("offline", updateAvailability);
    };
  }, [controller]);

  const announcements = state.announcements.status === "ready" ? state.announcements.value : NO_ANNOUNCEMENTS;
  const views = useMemo(
    () => new Map<string, PublicationView>(announcements.map((a) => [a.id, selectPublicationView(state, a.id)])),
    [announcements, state],
  );
  const summary = selectSummary(state);
  const selected = announcements.find((a) => a.id === selectedId) ?? announcements[0];
  const selectedView = selected ? views.get(selected.id) : undefined;
  const gate = selected ? canStartAttempt(state, selected.id) : undefined;

  const loading = state.announcements.status === "loading" || state.recovery.status === "recovering";
  const loadIssue =
    state.announcements.status === "failed"
      ? state.announcements.issue
      : state.recovery.status === "failed"
        ? state.recovery.issue
        : null;
  const status: WorkspaceStatus = isWorkspaceReady(state) ? "ready" : loading ? "loading" : "attention";

  const resetWorkspace = async () => {
    await controller.reset(); // rejects (and changes nothing) when service.reset() throws
    setSelectedId(undefined); // back to the default selection, like a fresh start
  };

  return (
    <>
      <div className={shell} inert={dialogOpen}>
        <a
          className="sr-only focus:not-sr-only focus:fixed focus:top-2.5 focus:left-2.5 focus:z-100 focus:rounded-md focus:border focus:border-accent focus:bg-white focus:p-3"
          href="#workspace"
        >
          Skip to workspace
        </a>
        <WorkspaceHeader />
        <main id="workspace" tabIndex={-1}>
          <WorkspaceIntro summary={summary} status={status} />
          <AutomaticUpdatesControl value={automaticUpdates} onChange={controller.setAutomaticUpdates} />

          {loadIssue && (
            <Alert
              title={
                state.announcements.status === "failed"
                  ? "Announcements could not be loaded."
                  : "Publication history could not be restored."
              }
              action={
                <Button variant="secondary" disabled={loading} onClick={() => void controller.loadWorkspace()}>
                  {loading ? "Retrying…" : "Retry loading"}
                </Button>
              }
            >
              <p>{describeIssue(loadIssue, false).what}</p>
              <p>
                {state.announcements.status === "failed"
                  ? "Publishing is unavailable until the announcements load."
                  : "We cannot tell whether announcements were already submitted, so new publications stay paused until the history is restored."}
              </p>
              <p>
                {automatic
                  ? "We’ll retry automatically. You can also retry now."
                  : "Automatic retries are paused. Use Retry loading."}
              </p>
            </Alert>
          )}

          <div className="grid grid-cols-1 items-start gap-4.5 md:grid-cols-[270px_minmax(0,1fr)] lg:grid-cols-[310px_minmax(0,1fr)] lg:gap-5.5">
            <AnnouncementList
              announcements={announcements}
              views={views}
              loading={state.announcements.status === "loading"}
              selectedId={selected?.id}
              onSelect={setSelectedId}
            />
            {selected && selectedView && gate ? (
              <AnnouncementDetails
                key={selected.id}
                announcement={selected}
                view={selectedView}
                attempts={selectAttempts(state, selected.id)}
                recovery={state.recovery}
                blockReason={gate.ok ? null : gate.reason}
                automatic={automatic}
                commands={controller}
              />
            ) : (
              <EmptyDetails status={state.announcements.status} />
            )}
          </div>
        </main>
        <WorkspaceFooter />
        <StatusAnnouncer announcements={announcements} views={views} ready={isWorkspaceReady(state)} />
      </div>
      <section className={`${shell} mb-8`} aria-label="Simulation tools" inert={dialogOpen}>
        <SimulationSettings service={service} onReset={resetWorkspace} onDialogChange={setDialogOpen} />
      </section>
    </>
  );
}
