import { act } from "@testing-library/react";
import { createAnnouncementMock } from "../mocks";
import type { AnnouncementScenario } from "../mocks";
import { createWorkspaceController } from "../controller/workspaceController";
import type { WorkspaceController } from "../controller/workspaceController";
import { selectAttempts, selectPublicationView } from "../domain/selectors";

/**
 * The mock measures time with Date.now() and setTimeout, both controlled by fake timers, so
 * advancing the clock advances the *real* mock service. Nothing about its timing is re-implemented.
 */
export const advance = async (ms: number): Promise<void> => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

export const installMockClock = (): void => {
  beforeEach(() => {
    sessionStorage.clear(); // the mock keeps its records here; isolates tests from each other
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
};

export const startController = async (scenario?: AnnouncementScenario) => {
  const service = createAnnouncementMock();
  if (scenario) service.setScenario(scenario);
  const controller = createWorkspaceController({ service });
  controller.start();
  await advance(250); // announcements (80ms) and operation list (100ms) have loaded
  return { service, controller };
};

export const viewOf = (controller: WorkspaceController, announcementId: string) =>
  selectPublicationView(controller.getState(), announcementId);

export const attemptsOf = (controller: WorkspaceController, announcementId: string) =>
  selectAttempts(controller.getState(), announcementId);

/** Starts nothing itself: advances the mock clock so an already-started request can settle, then awaits it. */
export const settle = async <T>(request: Promise<T>, ms = 300): Promise<T> => {
  await advance(ms);
  return request;
};
