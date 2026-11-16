import type { IAnnouncementService } from "../mocks";
import { createOperationId as defaultCreateOperationId, isValidId } from "../domain/operationId";
import { canResend, canStartAttempt, isWorkspaceReady } from "../domain/selectors";
import { isUnresolved } from "../domain/types";
import type { Issue, WorkspaceState } from "../domain/types";
import { initialState, workspaceReducer } from "../domain/workspaceReducer";
import type { WorkspaceAction } from "../domain/workspaceReducer";
import { invalidRequestIssue, toIssue as serviceErrorToIssue } from "./serviceErrors";

/** Delay between status checks while an operation is healthy but unfinished. */
export const POLL_INTERVAL_MS = 1_500;
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_MAX_MS = 15_000;

/** Exponential backoff (1s, 2s, 4s, 8s, then capped at 15s) for the n-th consecutive failure. */
export const retryDelay = (consecutiveFailures: number): number =>
  Math.min(BACKOFF_BASE_MS * 2 ** Math.max(0, consecutiveFailures - 1), BACKOFF_MAX_MS);

/**
 * The user's "Automatic updates" switch, kept apart from what the browser allows right now.
 * Automatic work runs only when all three are true; coming back online or visible never
 * turns a switch back on that the user turned off.
 */
export interface AutomaticUpdates {
  enabled: boolean;
  online: boolean;
  visible: boolean;
}

export const isAutomaticActive = ({ enabled, online, visible }: AutomaticUpdates): boolean =>
  enabled && online && visible;

export interface WorkspaceController {
  getState(): WorkspaceState;
  getAutomaticUpdates(): AutomaticUpdates;
  /** One listener list for both snapshots above. */
  subscribe(listener: () => void): () => void;
  /** Idempotent: loads the workspace if needed and resumes automatic work. Safe under StrictMode. */
  start(): void;
  /** Stops all timers (unmount). In-flight requests may finish and apply valid results. */
  stop(): void;
  setAutomaticUpdates(enabled: boolean): void;
  setAvailability(availability: Pick<AutomaticUpdates, "online" | "visible">): void;
  /** Starts a new attempt if and only if `canStartAttempt` allows it. Never rejects. */
  publish(announcementId: string): Promise<void>;
  /** Repeats the publish request of an unconfirmed attempt with the SAME operation ID. Never rejects. */
  resend(operationId: string): Promise<void>;
  /** One status check per operation at a time; concurrent callers share the same request. Never rejects. */
  checkStatus(operationId: string): Promise<void>;
  /** Loads whatever is not loaded yet (announcements, operation history). Never rejects. */
  loadWorkspace(): Promise<void>;
  /**
   * Development utility: `service.reset()`, then a fresh workspace loaded through public APIs.
   * Rejects (and changes nothing) if `service.reset()` throws.
   */
  reset(): Promise<void>;
}

/** The only controller methods the publication UI needs; components receive this, not the whole controller. */
export type PublicationCommands = Pick<WorkspaceController, "publish" | "checkStatus" | "resend">;

export interface ControllerOptions {
  service: IAnnouncementService;
  createOperationId?: () => string;
  now?: () => Date;
}

type Result<T> = { ok: true; value: T } | { ok: false; error: unknown };

/**
 * Owns every asynchronous interaction with the service. State lives outside React so that
 * (1) duplicate-click protection is synchronous: `publish` records the attempt before it
 * returns control, so a second click in the same tick already sees it; and
 * (2) effects only start/stop the controller instead of running business logic, which keeps
 * StrictMode's double-invoked effects from duplicating operations.
 */
export const createWorkspaceController = ({
  service,
  createOperationId = defaultCreateOperationId,
  now = () => new Date(),
}: ControllerOptions): WorkspaceController => {
  let state = initialState;
  let automatic: AutomaticUpdates = { enabled: true, online: true, visible: true };
  const listeners = new Set<() => void>();
  let started = false;

  /**
   * The reset boundary. Every service call remembers the epoch it started in; if a reset happened
   * meanwhile, its result, error and cleanup are all dropped (see `call`). Old promises may still
   * settle (the mock allows it), but they can no longer touch the new workspace or its bookkeeping.
   */
  let epoch = 0;
  /** Client request numbers, in start order. Orders feedback; see `OperationRecord.feedbackRequest`. */
  let lastRequest = 0;

  const pollTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const checksInFlight = new Map<string, Promise<void>>();
  const failureStreaks = new Map<string, number>();
  let loadInFlight: Promise<void> | null = null;
  let loadTimer: ReturnType<typeof setTimeout> | undefined;
  let loadFailures = 0;
  let resetInFlight: Promise<void> | null = null;

  const notify = (): void => listeners.forEach((listener) => listener());

  const dispatch = (action: WorkspaceAction): void => {
    const next = workspaceReducer(state, action);
    if (next === state) return;
    state = next;
    notify();
  };

  /** Runs one service call. Resolves to null if a reset happened meanwhile: the caller must then do nothing. */
  const call = async <T>(request: () => Promise<T>): Promise<Result<T> | null> => {
    const startedIn = epoch;
    let result: Result<T>;
    try {
      result = { ok: true, value: await request() };
    } catch (error) {
      result = { ok: false, error };
    }
    return startedIn === epoch ? result : null;
  };

  const toIssue = (error: unknown): Issue => {
    const issue = serviceErrorToIssue(error, now().toISOString());
    // Expected service errors are part of normal operation; only surprises are logged.
    if (issue.kind === "unexpected") console.error("[workspace]", issue.detail);
    return issue;
  };

  // ---- Automatic scheduling. Everything here only *reads*; it never publishes or resends. ----

  const following = (): boolean => started && isAutomaticActive(automatic);

  const clearPoll = (operationId: string): void => {
    clearTimeout(pollTimers.get(operationId));
    pollTimers.delete(operationId);
  };

  const schedulePoll = (operationId: string, delay: number): void => {
    clearPoll(operationId); // at most one timer per operation, so loops can never stack up
    if (!following()) return;
    pollTimers.set(
      operationId,
      setTimeout(() => {
        pollTimers.delete(operationId);
        void checkStatus(operationId);
      }, delay),
    );
  };

  const scheduleLoadRetry = (delay: number): void => {
    clearTimeout(loadTimer);
    loadTimer = undefined;
    if (!following()) return;
    loadTimer = setTimeout(() => {
      loadTimer = undefined;
      void loadWorkspace();
    }, delay);
  };

  const clearTimers = (): void => {
    pollTimers.forEach((timer) => clearTimeout(timer));
    pollTimers.clear();
    clearTimeout(loadTimer);
    loadTimer = undefined;
  };

  /** Automatic work just became possible again: one prompt read per pending item, not a replay of missed ticks. */
  const catchUp = (): void => {
    if (!following()) return;
    for (const record of state.operations.values()) {
      if (isUnresolved(record) && !checksInFlight.has(record.operationId)) schedulePoll(record.operationId, 0);
    }
    if (!isWorkspaceReady(state) && !loadInFlight) scheduleLoadRetry(0);
  };

  /** Decides, from current state, whether an operation still needs following. Called after every settle. */
  const followIfUnresolved = (operationId: string): void => {
    const record = state.operations.get(operationId);
    if (!record || !isUnresolved(record)) {
      clearPoll(operationId);
      failureStreaks.delete(operationId);
      return;
    }
    if (checksInFlight.has(operationId) || pollTimers.has(operationId)) return;
    const failures = failureStreaks.get(operationId) ?? 0;
    schedulePoll(operationId, failures === 0 ? POLL_INTERVAL_MS : retryDelay(failures));
  };

  const setAutomatic = (next: AutomaticUpdates): void => {
    if (next.enabled === automatic.enabled && next.online === automatic.online && next.visible === automatic.visible)
      return;
    const wasFollowing = following();
    automatic = next;
    notify();
    if (wasFollowing && !following()) clearTimers();
    if (!wasFollowing && following()) catchUp();
  };

  // ---- Service requests ----

  const checkStatus = (operationId: string): Promise<void> => {
    const running = checksInFlight.get(operationId);
    if (running) return running;
    const record = state.operations.get(operationId);
    if (!record || !isUnresolved(record)) return Promise.resolve();

    clearPoll(operationId);
    const request = ++lastRequest;
    dispatch({ type: "check/started", operationId });
    const run = (async () => {
      const result = await call(() => service.getStatus(operationId));
      if (!result) return; // started before a reset: the new workspace owns this ID now
      checksInFlight.delete(operationId);
      if (!result.ok) {
        dispatch({ type: "status/failed", operationId, issue: toIssue(result.error), request });
        failureStreaks.set(operationId, (failureStreaks.get(operationId) ?? 0) + 1);
      } else if (result.value === null) {
        const issue: Issue = {
          kind: "not-recorded",
          detail: "The service has no record of this operation.",
          occurredAt: now().toISOString(),
        };
        dispatch({ type: "status/notRecorded", operationId, issue, request });
        // While the publish request is still in flight "no record" is expected, not a failure.
        if (state.operations.get(operationId)?.publishRequest !== "sending") {
          failureStreaks.set(operationId, (failureStreaks.get(operationId) ?? 0) + 1);
        }
      } else {
        dispatch({ type: "snapshot/received", operationId, snapshot: result.value, source: "status", request });
        failureStreaks.delete(operationId);
      }
      dispatch({ type: "check/ended", operationId });
      followIfUnresolved(operationId);
    })();
    checksInFlight.set(operationId, run);
    return run;
  };

  const sendPublish = async (announcementId: string, operationId: string, request: number): Promise<void> => {
    // Validate before sending: only a request that never left the client is a definitive refusal.
    if (!isValidId(announcementId) || !isValidId(operationId)) {
      dispatch({ type: "publish/failed", operationId, issue: invalidRequestIssue(now().toISOString()), request });
      followIfUnresolved(operationId);
      return;
    }
    // Every other failure is classified at the service boundary and stays recoverable with the same ID.
    const result = await call(() => service.publish(announcementId, operationId));
    if (!result) return;
    if (result.ok)
      dispatch({ type: "snapshot/received", operationId, snapshot: result.value, source: "publish", request });
    else dispatch({ type: "publish/failed", operationId, issue: toIssue(result.error), request });
    followIfUnresolved(operationId);
  };

  const publish = async (announcementId: string): Promise<void> => {
    // Authoritative guard. It runs synchronously against up-to-date state, unlike a disabled button.
    if (!canStartAttempt(state, announcementId).ok) return;
    const operationId = createOperationId();
    if (state.operations.has(operationId)) {
      console.error("[workspace] generated an operation ID that is already tracked; publish aborted");
      return;
    }
    const request = ++lastRequest;
    dispatch({ type: "attempt/started", operationId, announcementId, at: now().toISOString(), request });
    // Follow the operation even before the publish response arrives: with slow responses the
    // publication can finish first, and a status check is how we learn about it.
    schedulePoll(operationId, POLL_INTERVAL_MS);
    await sendPublish(announcementId, operationId, request);
  };

  const resend = async (operationId: string): Promise<void> => {
    const record = state.operations.get(operationId);
    if (!record || !canResend(record)) return;
    const request = ++lastRequest;
    dispatch({ type: "publish/resending", operationId, request }); // flips to "sending" synchronously
    await sendPublish(record.announcementId, operationId, request); // same operation ID, by design
  };

  const loadAnnouncements = async (): Promise<void> => {
    dispatch({ type: "announcements/loading" });
    const result = await call(() => service.getAnnouncements());
    if (!result) return;
    if (result.ok) dispatch({ type: "announcements/loaded", items: result.value });
    else dispatch({ type: "announcements/failed", issue: toIssue(result.error) });
  };

  const recover = async (): Promise<void> => {
    const request = ++lastRequest;
    dispatch({ type: "recovery/started" });
    const result = await call(() => service.listOperations());
    if (!result) return;
    if (!result.ok) {
      // A failed list is "unknown", never "empty": publishing stays blocked until a retry succeeds.
      dispatch({ type: "recovery/failed", issue: toIssue(result.error) });
      return;
    }
    dispatch({ type: "recovery/succeeded", operations: result.value, request });
    [...state.operations.keys()].forEach(followIfUnresolved);
  };

  const loadWorkspace = (): Promise<void> => {
    if (loadInFlight) return loadInFlight;
    clearTimeout(loadTimer);
    loadTimer = undefined;
    const tasks: Promise<void>[] = [];
    if (state.announcements.status !== "ready") tasks.push(loadAnnouncements());
    if (state.recovery.status !== "ready") tasks.push(recover());
    if (tasks.length === 0) return Promise.resolve();
    const startedIn = epoch;
    const run = Promise.all(tasks).then(() => {
      if (startedIn !== epoch) return;
      loadInFlight = null;
      if (isWorkspaceReady(state)) {
        loadFailures = 0;
        return;
      }
      loadFailures += 1;
      scheduleLoadRetry(retryDelay(loadFailures));
    });
    loadInFlight = run;
    return run;
  };

  const reset = (): Promise<void> => {
    if (resetInFlight) return resetInFlight; // a second confirmation while resetting is ignored
    try {
      service.reset();
    } catch (error) {
      return Promise.reject(error); // nothing changed locally: the existing workspace stays
    }
    epoch += 1;
    clearTimers();
    checksInFlight.clear();
    failureStreaks.clear();
    loadInFlight = null;
    loadFailures = 0;
    dispatch({ type: "workspace/reset" }); // the Automatic updates preference is not workspace state
    const run = loadWorkspace().finally(() => {
      resetInFlight = null;
    });
    resetInFlight = run;
    return run;
  };

  return {
    getState: () => state,
    getAutomaticUpdates: () => automatic,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start: () => {
      if (started) return;
      started = true;
      // Initial loading is not "automatic": it runs even when Automatic updates is off.
      if (!isWorkspaceReady(state) && !loadInFlight) void loadWorkspace();
      catchUp();
    },
    stop: () => {
      started = false;
      clearTimers();
    },
    setAutomaticUpdates: (enabled) => setAutomatic({ ...automatic, enabled }),
    setAvailability: ({ online, visible }) => setAutomatic({ ...automatic, online, visible }),
    publish,
    resend,
    checkStatus,
    loadWorkspace,
    reset,
  };
};
