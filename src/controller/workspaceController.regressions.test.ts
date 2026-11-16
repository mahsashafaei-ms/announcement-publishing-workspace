import { AnnouncementMockError, createAnnouncementMock } from "../mocks";
import type { IAnnouncement, IAnnouncementService, PublicationOperation } from "../mocks";
import { createWorkspaceController, POLL_INTERVAL_MS } from "./workspaceController";
import { canStartAttempt } from "../domain/selectors";
import { processing, published } from "../test/fixtures";
import { advance, installMockClock, settle, viewOf } from "../test/helpers";

installMockClock();

/** A promise the test settles by hand, so the order of responses is fully controlled. */
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};
type Deferred<T> = ReturnType<typeof deferred<T>>;

const ANNOUNCEMENTS: IAnnouncement[] = [
  { id: "ann-101", title: "One", body: "b" },
  { id: "ann-102", title: "Two", body: "b" },
];

/** Every call returns a pending promise recorded in `calls`; nothing settles on its own. */
const controlledService = () => {
  const calls = {
    announcements: [] as Deferred<IAnnouncement[]>[],
    list: [] as Deferred<PublicationOperation[]>[],
    publish: [] as { operationId: string; d: Deferred<PublicationOperation> }[],
    status: [] as { operationId: string; d: Deferred<PublicationOperation | null> }[],
  };
  const service: IAnnouncementService = {
    getAnnouncements: () => {
      const d = deferred<IAnnouncement[]>();
      calls.announcements.push(d);
      return d.promise;
    },
    listOperations: () => {
      const d = deferred<PublicationOperation[]>();
      calls.list.push(d);
      return d.promise;
    },
    publish: (_a, operationId) => {
      const d = deferred<PublicationOperation>();
      calls.publish.push({ operationId, d });
      return d.promise;
    },
    getStatus: (operationId) => {
      const d = deferred<PublicationOperation | null>();
      calls.status.push({ operationId, d });
      return d.promise;
    },
    setScenario: () => undefined,
    getScenario: () => "success",
    reset: vi.fn(),
  };
  return { service, calls };
};

const unavailable = (operationId = "op-1") =>
  new AnnouncementMockError("STATUS_UNAVAILABLE", "req-x", operationId, "ann-101");
const lost = (operationId = "op-1") => new AnnouncementMockError("RESPONSE_LOST", "req-y", operationId, "ann-101");

/** A started controller whose announcements and (empty) history have loaded. */
const ready = async (ids: string[] = ["op-1", "op-2", "op-3"]) => {
  const { service, calls } = controlledService();
  const queue = [...ids];
  const controller = createWorkspaceController({ service, createOperationId: () => queue.shift() ?? "op-x" });
  controller.start();
  calls.announcements[0]?.resolve(ANNOUNCEMENTS);
  calls.list[0]?.resolve([]);
  await advance(0);
  return { service, calls, controller, op: (id = "op-1") => controller.getState().operations.get(id) };
};

describe("request feedback ordering", () => {
  it("an older processing publish response does not erase a newer status-check failure", async () => {
    const { calls, controller, op } = await ready();
    void controller.publish("ann-101"); // request 1
    void controller.checkStatus("op-1"); // request 2
    calls.status[0]?.d.reject(unavailable());
    await advance(0);
    expect(op()?.issue?.kind).toBe("status-unavailable");

    calls.publish[0]?.d.resolve(processing());
    await advance(0);
    expect(op()?.snapshot?.status).toBe("processing"); // the fact is accepted
    expect(op()?.issue?.kind).toBe("status-unavailable"); // the newer feedback is kept
    controller.stop();
  });

  it("a newer successful check resolves the error even though the version did not change", async () => {
    const { calls, controller, op } = await ready();
    void controller.publish("ann-101");
    calls.publish[0]?.d.resolve(processing());
    await advance(0);
    void controller.checkStatus("op-1");
    calls.status[0]?.d.reject(unavailable());
    await advance(0);
    expect(op()?.issue?.kind).toBe("status-unavailable");

    void controller.checkStatus("op-1");
    calls.status[1]?.d.resolve(processing()); // same version 1
    await advance(0);
    expect(op()?.issue).toBeNull();
    controller.stop();
  });

  it("a delayed publish failure does not overwrite newer successful feedback", async () => {
    const { calls, controller, op } = await ready();
    void controller.publish("ann-101");
    void controller.checkStatus("op-1");
    calls.status[0]?.d.resolve(processing());
    await advance(0);
    calls.publish[0]?.d.reject(lost());
    await advance(0);
    expect(op()?.issue).toBeNull();
    expect(viewOf(controller, "ann-101").kind).toBe("processing");
    controller.stop();
  });

  it("accepts a terminal result from an older request and never lets an error replace it", async () => {
    const { calls, controller, op } = await ready();
    void controller.publish("ann-101");
    void controller.checkStatus("op-1");
    calls.status[0]?.d.reject(unavailable()); // newer request failed first
    await advance(0);
    calls.publish[0]?.d.resolve(published()); // older request carries the outcome
    await advance(0);
    expect(viewOf(controller, "ann-101").kind).toBe("published");
    expect(op()?.issue).toBeNull();
    controller.stop();
  });

  it("keeps different announcements' feedback independent", async () => {
    const { calls, controller, op } = await ready();
    void controller.publish("ann-101");
    void controller.publish("ann-102");
    calls.publish[0]?.d.reject(lost("op-1"));
    calls.publish[1]?.d.resolve(processing("op-2", "ann-102"));
    await advance(0);
    expect(op("op-1")?.issue?.kind).toBe("response-lost");
    expect(op("op-2")?.issue).toBeNull();
    controller.stop();
  });
});

describe("recovery gating", () => {
  it("blocks publish() in application logic while recovery is in progress or failed", async () => {
    const { service, calls } = controlledService();
    const publish = vi.spyOn(service, "publish");
    const controller = createWorkspaceController({ service });
    controller.start();
    calls.announcements[0]?.resolve(ANNOUNCEMENTS);
    await advance(0);
    await controller.publish("ann-101"); // recovery still running
    expect(viewOf(controller, "ann-101").kind).toBe("restoring");

    calls.list[0]?.reject(unavailable());
    await advance(0);
    await controller.publish("ann-101"); // recovery failed
    expect(viewOf(controller, "ann-101").kind).toBe("history-unavailable");
    expect(publish).not.toHaveBeenCalled();
    controller.stop();
  });
});

describe("special operation IDs", () => {
  it("recovers published constructor / toString / __proto__ operations and prevents republishing", async () => {
    const service = createAnnouncementMock();
    void service.publish("ann-101", "constructor");
    void service.publish("ann-102", "toString");
    void service.publish("ann-103", "__proto__");
    await advance(3_000); // all published on the service

    const publish = vi.spyOn(service, "publish");
    const controller = createWorkspaceController({ service, createOperationId: () => "constructor" });
    controller.start();
    await advance(250);
    expect([...controller.getState().operations.keys()].sort()).toEqual(["__proto__", "constructor", "toString"]);
    for (const [announcementId, operationId] of [
      ["ann-101", "constructor"],
      ["ann-102", "toString"],
      ["ann-103", "__proto__"],
    ] as const) {
      const view = viewOf(controller, announcementId);
      expect(view.kind).toBe("published");
      expect("attempt" in view && view.attempt.operationId).toBe(operationId);
      expect(canStartAttempt(controller.getState(), announcementId)).toEqual({
        ok: false,
        reason: "already-published",
      });
      await controller.publish(announcementId);
    }
    expect(publish).not.toHaveBeenCalled();
    controller.stop();
  });

  it("registers and follows a new attempt whose generated ID is an Object.prototype name", async () => {
    const { calls, controller, op } = await ready(["toString"]);
    void controller.publish("ann-101");
    expect(op("toString")?.publishRequest).toBe("sending"); // not mistaken for an existing record
    calls.publish[0]?.d.resolve(published("toString"));
    await advance(0);
    expect(viewOf(controller, "ann-101").kind).toBe("published");
    controller.stop();
  });
});

describe("reset", () => {
  it("drops every pre-reset response and cleanup, even for an operation ID reused after reset", async () => {
    const { service, calls, controller, op } = await ready(["op-1", "op-1"]);
    void controller.publish("ann-101");
    void controller.checkStatus("op-1");
    const oldPublish = calls.publish[0];
    const oldCheck = calls.status[0];

    const reset = controller.reset();
    expect(service.reset).toHaveBeenCalledTimes(1);
    expect(controller.getState().operations.size).toBe(0);
    calls.announcements[1]?.resolve(ANNOUNCEMENTS);
    calls.list[1]?.resolve([]);
    await reset;

    void controller.publish("ann-101"); // same ID as before the reset
    void controller.checkStatus("op-1");
    expect(calls.status).toHaveLength(2);

    // Old promises settle late (the mock allows this).
    oldPublish?.d.resolve(published());
    oldCheck?.d.reject(unavailable());
    await advance(0);
    expect(op()?.snapshot).toBeNull();
    expect(op()?.issue).toBeNull();
    expect(op()?.checking).toBe(true); // the old check's cleanup did not end the new check
    void controller.checkStatus("op-1"); // still deduplicated against the new in-flight check
    expect(calls.status).toHaveLength(2);
    controller.stop();
  });

  it("does not restart obsolete polling from pre-reset completions", async () => {
    const { calls, controller } = await ready();
    void controller.publish("ann-101");
    const oldPublish = calls.publish[0];
    const reset = controller.reset();
    calls.announcements[1]?.resolve(ANNOUNCEMENTS);
    calls.list[1]?.resolve([]);
    await reset;
    oldPublish?.d.reject(lost());
    await advance(POLL_INTERVAL_MS * 10);
    expect(calls.status).toHaveLength(0);
    controller.stop();
  });

  it("changes nothing and rejects when service.reset() throws", async () => {
    const { service, calls, controller } = await ready();
    void controller.publish("ann-101");
    calls.publish[0]?.d.resolve(published());
    await advance(0);
    const before = controller.getState();
    vi.mocked(service.reset).mockImplementationOnce(() => {
      throw new Error("no storage");
    });
    await expect(controller.reset()).rejects.toThrow("no storage");
    expect(controller.getState()).toBe(before);
    controller.stop();
  });

  it("keeps the Automatic updates preference and ignores a second reset while one is running", async () => {
    const { service, calls, controller } = await ready();
    controller.setAutomaticUpdates(false);
    const first = controller.reset();
    const second = controller.reset();
    expect(second).toBe(first);
    expect(service.reset).toHaveBeenCalledTimes(1);
    expect(controller.getState().recovery.status).toBe("recovering");
    calls.announcements[1]?.resolve(ANNOUNCEMENTS);
    calls.list[1]?.resolve([]);
    await first;
    expect(controller.getAutomaticUpdates().enabled).toBe(false);
    expect(controller.getState().recovery.status).toBe("ready"); // reset initialisation runs even when off
    controller.stop();
  });

  it("reports a recovery problem (not old history) when loading after reset fails", async () => {
    const { calls, controller } = await ready();
    void controller.publish("ann-101");
    calls.publish[0]?.d.resolve(published());
    await advance(0);
    const reset = controller.reset();
    calls.announcements[1]?.resolve(ANNOUNCEMENTS);
    calls.list[1]?.reject(unavailable());
    await reset;
    expect(controller.getState().recovery.status).toBe("failed");
    expect(viewOf(controller, "ann-101").kind).toBe("history-unavailable");
    controller.stop();
  });
});

describe("Automatic updates", () => {
  it("off: schedules no checks, even when responses settle; manual checks still work", async () => {
    const { calls, controller } = await ready();
    controller.setAutomaticUpdates(false);
    void controller.publish("ann-101");
    calls.publish[0]?.d.resolve(processing());
    await advance(60_000);
    expect(calls.status).toHaveLength(0);

    void controller.checkStatus("op-1");
    calls.status[0]?.d.resolve(processing());
    await advance(60_000);
    expect(calls.status).toHaveLength(1); // the settled manual check scheduled nothing
    controller.stop();
  });

  it("a response settling after the switch is turned off does not schedule another check", async () => {
    const { calls, controller } = await ready();
    void controller.publish("ann-101");
    calls.publish[0]?.d.resolve(processing());
    await advance(POLL_INTERVAL_MS);
    expect(calls.status).toHaveLength(1);
    controller.setAutomaticUpdates(false);
    calls.status[0]?.d.reject(unavailable()); // in flight while switched off; still applied
    await advance(60_000);
    expect(calls.status).toHaveLength(1);
    expect(controller.getState().operations.get("op-1")?.issue?.kind).toBe("status-unavailable");
    controller.stop();
  });

  it("re-enabling catches up once per operation, without bursts after repeated toggles", async () => {
    const { calls, controller } = await ready();
    controller.setAutomaticUpdates(false);
    void controller.publish("ann-101");
    calls.publish[0]?.d.resolve(processing());
    await advance(10_000);
    for (let i = 0; i < 5; i += 1) {
      controller.setAutomaticUpdates(true);
      controller.setAutomaticUpdates(false);
    }
    controller.setAutomaticUpdates(true);
    await advance(0);
    expect(calls.status).toHaveLength(1);
    controller.stop();
  });

  it("deduplicates an automatic check with an overlapping manual one", async () => {
    const { calls, controller } = await ready();
    void controller.publish("ann-101");
    calls.publish[0]?.d.resolve(processing());
    await advance(POLL_INTERVAL_MS - 10);
    void controller.checkStatus("op-1"); // manual check, then the poll would have been due
    await advance(POLL_INTERVAL_MS);
    expect(calls.status).toHaveLength(1);
    controller.stop();
  });

  it("stops following terminal operations", async () => {
    const { calls, controller } = await ready();
    void controller.publish("ann-101");
    calls.publish[0]?.d.resolve(processing());
    await advance(POLL_INTERVAL_MS);
    calls.status[0]?.d.resolve(published());
    await advance(60_000);
    expect(calls.status).toHaveLength(1);
    controller.stop();
  });

  it("retries failed recovery with backoff only while enabled, and catches up when re-enabled", async () => {
    const { service, calls } = controlledService();
    const controller = createWorkspaceController({ service });
    controller.start();
    calls.announcements[0]?.resolve(ANNOUNCEMENTS);
    calls.list[0]?.reject(unavailable());
    await advance(0);
    await advance(1_000); // first backoff step
    expect(calls.list).toHaveLength(2);
    calls.list[1]?.reject(unavailable());
    await advance(0);
    controller.setAutomaticUpdates(false);
    await advance(60_000);
    expect(calls.list).toHaveLength(2);
    controller.setAutomaticUpdates(true);
    await advance(0);
    expect(calls.list).toHaveLength(3);
    controller.stop();
  });

  it("availability pauses checks without changing the preference; it never re-enables a disabled switch", async () => {
    const { calls, controller } = await ready();
    void controller.publish("ann-101");
    calls.publish[0]?.d.resolve(processing());
    await advance(0);
    controller.setAvailability({ online: true, visible: false });
    await advance(10_000);
    expect(calls.status).toHaveLength(0);
    expect(controller.getAutomaticUpdates().enabled).toBe(true);

    controller.setAvailability({ online: true, visible: true }); // catch up
    await advance(0);
    expect(calls.status).toHaveLength(1);
    calls.status[0]?.d.resolve(processing());
    await advance(0);

    controller.setAutomaticUpdates(false);
    controller.setAvailability({ online: false, visible: true });
    controller.setAvailability({ online: true, visible: true });
    await advance(10_000);
    expect(controller.getAutomaticUpdates().enabled).toBe(false);
    expect(calls.status).toHaveLength(1);
    controller.stop();
  });

  it("stop/start cycles (StrictMode, remounts) leave no timers behind", async () => {
    const { calls, controller } = await ready();
    void controller.publish("ann-101");
    calls.publish[0]?.d.resolve(processing());
    await advance(0);
    controller.stop();
    controller.start();
    controller.stop();
    expect(vi.getTimerCount()).toBe(0);
    await advance(60_000);
    expect(calls.status).toHaveLength(0);
  });
});

describe("error classification and safe recovery", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined); // unexpected errors are logged on purpose
  });

  it("a generic TypeError during publication is not a refusal: the attempt stays recoverable", async () => {
    const { calls, controller, op } = await ready();
    void controller.publish("ann-101");
    calls.publish[0]?.d.reject(new TypeError("Failed to read the response"));
    await advance(0);
    expect(op()).toMatchObject({ publishRequest: "unconfirmed", snapshot: null });
    expect(op()?.issue?.kind).toBe("unexpected");
    expect(viewOf(controller, "ann-101").kind).toBe("unconfirmed");
    expect(canStartAttempt(controller.getState(), "ann-101")).toEqual({ ok: false, reason: "attempt-unresolved" });
    controller.stop();
  });

  it("a generic RangeError during publication is not a refusal either", async () => {
    const { calls, controller, op } = await ready();
    void controller.publish("ann-101");
    calls.publish[0]?.d.reject(new RangeError("Invalid time value"));
    await advance(0);
    expect(op()?.publishRequest).toBe("unconfirmed");
    expect(canStartAttempt(controller.getState(), "ann-101").ok).toBe(false);
    controller.stop();
  });

  it("an unexpected error after the service recorded the operation is recovered with the same ID, without a duplicate", async () => {
    const service = createAnnouncementMock();
    const publishOriginal = service.publish.bind(service);
    const publish = vi.spyOn(service, "publish").mockImplementationOnce(async (announcementId, operationId) => {
      await publishOriginal(announcementId, operationId); // the operation IS recorded...
      throw new TypeError("response could not be parsed"); // ...but the client never sees the answer
    });
    const controller = createWorkspaceController({ service, createOperationId: () => "op-recorded" });
    controller.start();
    await advance(250);
    void controller.publish("ann-101");
    await advance(200);
    expect(viewOf(controller, "ann-101").kind).toBe("unconfirmed");

    void controller.resend("op-recorded"); // safe repetition
    await advance(200);
    expect(publish).toHaveBeenLastCalledWith("ann-101", "op-recorded");
    await advance(3_000);
    expect(viewOf(controller, "ann-101").kind).toBe("published");
    const recorded = await settle(service.listOperations());
    expect(recorded.map((o) => o.operationId)).toEqual(["op-recorded"]); // exactly one operation
    controller.stop();
  });

  it("keeps the original operation ID for status checks and resends after a communication failure", async () => {
    const { calls, controller } = await ready(["op-1", "op-NEW"]);
    void controller.publish("ann-101");
    calls.publish[0]?.d.reject(new TypeError("network"));
    await advance(0);
    void controller.checkStatus("op-1");
    void controller.resend("op-1");
    expect(calls.status.map((c) => c.operationId)).toEqual(["op-1"]);
    expect(calls.publish.map((c) => c.operationId)).toEqual(["op-1", "op-1"]);
    expect(controller.getState().operations.has("op-NEW")).toBe(false); // no new ID was generated
    controller.stop();
  });

  it("a confirmed published result is never overwritten by later communication errors", async () => {
    const { calls, controller, op } = await ready();
    void controller.publish("ann-101");
    void controller.checkStatus("op-1");
    calls.status[0]?.d.resolve(published());
    await advance(0);
    calls.publish[0]?.d.reject(new TypeError("late failure"));
    await advance(0);
    expect(viewOf(controller, "ann-101").kind).toBe("published");
    expect(op()?.issue).toBeNull();
    controller.stop();
  });

  it("a failed status check never turns Processing into Rejected", async () => {
    const { calls, controller } = await ready();
    void controller.publish("ann-101");
    calls.publish[0]?.d.resolve(processing());
    await advance(0);
    void controller.checkStatus("op-1");
    calls.status[0]?.d.reject(unavailable());
    await advance(0);
    expect(viewOf(controller, "ann-101").kind).toBe("processing");
    controller.stop();
  });

  it("refuses to send a request with an invalid ID, and only then reports a definitive refusal", async () => {
    const { calls, controller, op } = await ready(["   "]);
    await controller.publish("ann-101");
    expect(calls.publish).toHaveLength(0); // nothing reached the service
    expect(op("   ")).toMatchObject({ publishRequest: "refused" });
    expect(op("   ")?.issue?.kind).toBe("invalid-request");
    controller.stop();
  });
});
