import { createAnnouncementMock } from "../mocks";
import type { IAnnouncementService } from "../mocks";
import { POLL_INTERVAL_MS, createWorkspaceController, retryDelay } from "./workspaceController";
import { advance, attemptsOf, settle, startController, installMockClock, viewOf } from "../test/helpers";

installMockClock();

describe("retryDelay", () => {
  it("backs off exponentially and caps", () => {
    expect([1, 2, 3, 4, 5, 10].map(retryDelay)).toEqual([1000, 2000, 4000, 8000, 15000, 15000]);
  });
});

describe("initial load", () => {
  it("loads the three announcements from the service and recovers an empty history", async () => {
    const { controller } = await startController();
    const { announcements, recovery } = controller.getState();
    expect(announcements.status === "ready" && announcements.value.map((a) => a.id)).toEqual([
      "ann-101",
      "ann-102",
      "ann-103",
    ]);
    expect(recovery.status).toBe("ready");
    controller.stop();
  });
});

describe("scenario: success", () => {
  it("submits, shows processing, then published with metadata, and stops polling", async () => {
    const { service, controller } = await startController("success");
    const getStatus = vi.spyOn(service, "getStatus");

    const done = controller.publish("ann-101");
    expect(viewOf(controller, "ann-101").kind).toBe("submitting"); // recorded synchronously
    await settle(done);
    expect(viewOf(controller, "ann-101").kind).toBe("processing");

    await advance(4_000);
    const view = viewOf(controller, "ann-101");
    expect(view.kind).toBe("published");
    if (view.kind === "published") {
      expect(view.snapshot.publicationId).toMatch(/^publication-/);
      expect(view.snapshot.publishedAt).toMatch(/^\d{4}-/);
    }

    const calls = getStatus.mock.calls.length;
    expect(calls).toBeGreaterThan(0);
    await advance(30_000);
    expect(getStatus.mock.calls.length).toBe(calls); // terminal: nobody polls any more
    controller.stop();
  });

  it("does not allow another publication after success", async () => {
    const { service, controller } = await startController("success");
    await settle(controller.publish("ann-101"));
    await advance(4_000);
    expect(viewOf(controller, "ann-101").kind).toBe("published");

    await settle(controller.publish("ann-101"));
    expect(attemptsOf(controller, "ann-101")).toHaveLength(1);
    expect(await serviceOps(service)).toHaveLength(1);
    controller.stop();
  });
});

const serviceOps = async (service: IAnnouncementService) => {
  const pending = service.listOperations();
  await advance(200);
  return pending;
};

describe("duplicate clicks", () => {
  it("creates exactly one attempt for rapid repeated publish calls", async () => {
    const { service, controller } = await startController();
    const publish = vi.spyOn(service, "publish");
    await settle(
      Promise.all([controller.publish("ann-101"), controller.publish("ann-101"), controller.publish("ann-101")]),
    );
    expect(publish).toHaveBeenCalledTimes(1);
    expect(attemptsOf(controller, "ann-101")).toHaveLength(1);
    controller.stop();
  });
});

describe("scenario: explicit-rejection", () => {
  it("shows the service's reason, keeps the rejected attempt, and a new attempt gets a new ID", async () => {
    const { service, controller } = await startController("explicit-rejection");
    await settle(controller.publish("ann-101"));
    const view = viewOf(controller, "ann-101");
    expect(view.kind).toBe("rejected");
    if (view.kind === "rejected")
      expect(view.snapshot.reason).toBe("This announcement was declined by the publication service.");
    const first = attemptsOf(controller, "ann-101")[0];

    service.setScenario("success");
    await settle(controller.publish("ann-101"));
    const attempts = attemptsOf(controller, "ann-101");
    expect(attempts).toHaveLength(2);
    expect(attempts[0]).toEqual(first); // history untouched
    expect(attempts[1]?.operationId).not.toBe(first?.operationId);
    expect(viewOf(controller, "ann-101").kind).toBe("processing");
    controller.stop();
  });
});

describe("scenario: lost-response", () => {
  it("reports an unconfirmed outcome, keeps one operation, and recovers via the same ID", async () => {
    const { service, controller } = await startController("lost-response");
    await settle(controller.publish("ann-101"));
    const view = viewOf(controller, "ann-101");
    expect(view.kind).toBe("unconfirmed");
    const operationId = attemptsOf(controller, "ann-101")[0]?.operationId ?? "";
    expect(attemptsOf(controller, "ann-101")[0]?.issue?.kind).toBe("response-lost");

    const publish = vi.spyOn(service, "publish");
    const resend = controller.resend(operationId);
    expect(viewOf(controller, "ann-101").kind).toBe("submitting");
    await settle(resend, 200);
    expect(publish).toHaveBeenCalledWith("ann-101", operationId); // same ID, never a new one
    expect(viewOf(controller, "ann-101").kind).toBe("processing");
    expect(attemptsOf(controller, "ann-101")).toHaveLength(1);
    expect(await serviceOps(service)).toHaveLength(1); // the service never saw a second operation
    controller.stop();
  });

  it("manual status check resolves the unconfirmed attempt without publishing again", async () => {
    const { service, controller } = await startController("lost-response");
    const publish = vi.spyOn(service, "publish");
    await settle(controller.publish("ann-101"));
    const id = attemptsOf(controller, "ann-101")[0]?.operationId ?? "";
    const check = controller.checkStatus(id);
    await advance(150);
    await check;
    expect(viewOf(controller, "ann-101").kind).toBe("processing");
    expect(publish).toHaveBeenCalledTimes(1);
    controller.stop();
  });

  it("automatic polling also resolves it eventually", async () => {
    const { controller } = await startController("lost-response");
    await settle(controller.publish("ann-101"));
    await advance(POLL_INTERVAL_MS + 500);
    expect(["processing", "published"]).toContain(viewOf(controller, "ann-101").kind);
    controller.stop();
  });
});

describe("scenario: status-check-failure", () => {
  it("keeps the attempt unresolved (not rejected) after a failed check and recovers on the next one", async () => {
    const { controller } = await startController("status-check-failure");
    await settle(controller.publish("ann-101"));
    const id = attemptsOf(controller, "ann-101")[0]?.operationId ?? "";
    expect(viewOf(controller, "ann-101").kind).toBe("unconfirmed");

    const first = controller.checkStatus(id);
    await advance(150);
    await first;
    expect(viewOf(controller, "ann-101").kind).toBe("unconfirmed");
    expect(attemptsOf(controller, "ann-101")[0]?.issue?.kind).toBe("status-unavailable");

    const second = controller.checkStatus(id);
    await advance(150);
    await second;
    expect(viewOf(controller, "ann-101").kind).toBe("processing");
    expect(attemptsOf(controller, "ann-101")[0]?.issue).toBeNull();
    controller.stop();
  });

  it("keeps the last known snapshot when a later status check fails", async () => {
    const { service, controller } = await startController("success");
    await settle(controller.publish("ann-101"));
    const id = attemptsOf(controller, "ann-101")[0]?.operationId ?? "";
    vi.spyOn(service, "getStatus").mockRejectedValueOnce(new Error("network down"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await controller.checkStatus(id);
    const view = viewOf(controller, "ann-101");
    expect(view.kind).toBe("processing");
    expect(attemptsOf(controller, "ann-101")[0]?.issue?.kind).toBe("unexpected");
    controller.stop();
  });

  it("retries automatically with backoff after a failure", async () => {
    const { controller } = await startController("status-check-failure");
    await settle(controller.publish("ann-101"));
    await advance(POLL_INTERVAL_MS + 200); // auto check #1 fails
    expect(attemptsOf(controller, "ann-101")[0]?.issue?.kind).toBe("status-unavailable");
    await advance(1_500); // backoff 1s, then success
    expect(viewOf(controller, "ann-101").kind).toBe("processing");
    controller.stop();
  });

  it("one operation's failing status check does not affect another operation", async () => {
    const { service, controller } = await startController("status-check-failure");
    await settle(controller.publish("ann-101")); // will have a pending status failure
    service.setScenario("success");
    await settle(controller.publish("ann-102"));
    const [a, b] = [attemptsOf(controller, "ann-101")[0], attemptsOf(controller, "ann-102")[0]];

    const checkA = controller.checkStatus(a?.operationId ?? "");
    const checkB = controller.checkStatus(b?.operationId ?? "");
    await advance(150);
    await Promise.all([checkA, checkB]);
    expect(viewOf(controller, "ann-101").kind).toBe("unconfirmed");
    expect(viewOf(controller, "ann-102").kind).toBe("processing");
    expect(attemptsOf(controller, "ann-102")[0]?.issue).toBeNull();
    controller.stop();
  });
});

describe("scenario: overlapping", () => {
  it("associates each completion with the right announcement even when they finish out of order", async () => {
    const { controller } = await startController("overlapping");
    await settle(
      Promise.all([controller.publish("ann-101"), controller.publish("ann-102"), controller.publish("ann-103")]),
      700,
    );
    await advance(1_000);
    expect(viewOf(controller, "ann-101").kind).toBe("processing");
    expect(viewOf(controller, "ann-102").kind).toBe("processing");

    await advance(2_500); // ~3.5s: 102 (2s) done, 103 (6s) and 101 (10s) still running
    expect(viewOf(controller, "ann-102").kind).toBe("published");
    expect(viewOf(controller, "ann-103").kind).toBe("processing");
    expect(viewOf(controller, "ann-101").kind).toBe("processing");

    await advance(3_500); // ~7s: 103 done before 101
    expect(viewOf(controller, "ann-103").kind).toBe("published");
    expect(viewOf(controller, "ann-101").kind).toBe("processing");

    await advance(5_000);
    expect(viewOf(controller, "ann-101").kind).toBe("published");
    for (const id of ["ann-101", "ann-102", "ann-103"]) {
      const v = viewOf(controller, id);
      expect(v.kind === "published" && v.snapshot.announcementId).toBe(id);
    }
    controller.stop();
  });
});

describe("scenario: slow-response", () => {
  it("stays Published when the delayed, older processing response arrives after a status check", async () => {
    const { controller } = await startController("slow-response");
    const publishing = controller.publish("ann-101"); // response arrives after 4.5s, carrying a version-1 snapshot
    const id = attemptsOf(controller, "ann-101")[0]?.operationId ?? "";

    await advance(2_000); // the operation (1.5s) is done; the publish response is still in flight
    const check = controller.checkStatus(id);
    await advance(150);
    await check;
    expect(viewOf(controller, "ann-101").kind).toBe("published");
    expect(attemptsOf(controller, "ann-101")[0]?.publishRequest).toBe("sending");

    await advance(3_000); // the stale processing snapshot is delivered now
    await publishing;
    expect(attemptsOf(controller, "ann-101")[0]?.publishRequest).toBe("accepted");
    expect(viewOf(controller, "ann-101").kind).toBe("published");
    controller.stop();
  });

  it("learns about completion through automatic polling before the publish response arrives", async () => {
    const { controller } = await startController("slow-response");
    void controller.publish("ann-101");
    await advance(3_500);
    expect(viewOf(controller, "ann-101").kind).toBe("published");
    controller.stop();
  });
});

describe("refresh recovery", () => {
  it("restores in-progress work from the service and follows it to completion", async () => {
    const first = await startController("success");
    await settle(first.controller.publish("ann-102"));
    const original = attemptsOf(first.controller, "ann-102")[0];
    first.controller.stop(); // the page goes away

    const { controller } = await startController(); // new service client, same sessionStorage
    expect(viewOf(controller, "ann-102").kind).toBe("processing");
    expect(attemptsOf(controller, "ann-102")[0]?.operationId).toBe(original?.operationId);
    expect(viewOf(controller, "ann-101").kind).toBe("not-submitted");

    await advance(4_000);
    expect(viewOf(controller, "ann-102").kind).toBe("published");
    controller.stop();
  });

  it("restores a confirmed terminal outcome and does not poll it", async () => {
    const first = await startController("success");
    await settle(first.controller.publish("ann-101"));
    await advance(4_000);
    first.controller.stop();

    const { service, controller } = await startController();
    const getStatus = vi.spyOn(service, "getStatus");
    expect(viewOf(controller, "ann-101").kind).toBe("published");
    await advance(10_000);
    expect(getStatus).not.toHaveBeenCalled();
    controller.stop();
  });

  it("blocks all publishing while recovery fails, then recovers on retry without creating duplicates", async () => {
    const first = await startController("status-check-failure");
    await settle(first.controller.publish("ann-101")); // response lost; the pending status failure is still unused
    first.controller.stop();

    const service = createAnnouncementMock();
    const publish = vi.spyOn(service, "publish");
    const controller = createWorkspaceController({ service });
    controller.start();
    await advance(250); // listOperations() consumes the pending failure
    expect(controller.getState().recovery.status).toBe("failed");

    await settle(controller.publish("ann-102")); // would be a duplicate-risk if recovery were assumed empty
    await settle(controller.publish("ann-101"));
    expect(publish).not.toHaveBeenCalled();
    expect(attemptsOf(controller, "ann-101")).toHaveLength(0);

    await advance(1_200); // automatic retry after 1s backoff
    expect(controller.getState().recovery.status).toBe("ready");
    expect(viewOf(controller, "ann-101").kind).toBe("processing"); // recovered, not duplicated
    expect(attemptsOf(controller, "ann-101")).toHaveLength(1);
    controller.stop();
  });

  it("manual retry recovers immediately", async () => {
    const first = await startController("status-check-failure");
    await settle(first.controller.publish("ann-101"));
    first.controller.stop();

    const controller = createWorkspaceController({ service: createAnnouncementMock() });
    controller.start();
    await advance(250);
    expect(controller.getState().recovery.status).toBe("failed");
    const retry = controller.loadWorkspace();
    await advance(150);
    await retry;
    expect(controller.getState().recovery.status).toBe("ready");
    controller.stop();
  });
});

describe("null status response", () => {
  it("is not a rejection: an unconfirmed attempt stays unconfirmed and can be resent with the same ID", async () => {
    const { service, controller } = await startController("lost-response");
    await settle(controller.publish("ann-101"));
    const id = attemptsOf(controller, "ann-101")[0]?.operationId ?? "";
    service.reset(); // the service now has no record of the operation

    const check = controller.checkStatus(id);
    await advance(150);
    await check;
    expect(viewOf(controller, "ann-101").kind).toBe("unconfirmed");
    expect(attemptsOf(controller, "ann-101")[0]?.issue?.kind).toBe("not-recorded");
    controller.stop();
  });

  it("never erases a known snapshot", async () => {
    const { service, controller } = await startController("success");
    await settle(controller.publish("ann-101"));
    const id = attemptsOf(controller, "ann-101")[0]?.operationId ?? "";
    service.reset();
    const check = controller.checkStatus(id);
    await advance(150);
    await check;
    expect(viewOf(controller, "ann-101").kind).toBe("processing");
    expect(attemptsOf(controller, "ann-101")[0]?.issue?.kind).toBe("not-recorded");
    controller.stop();
  });
});

describe("operation ID conflict", () => {
  it("surfaces the error, does not generate another ID on its own, and keeps the other announcement intact", async () => {
    const service = createAnnouncementMock();
    const publish = vi.spyOn(service, "publish");
    const controller = createWorkspaceController({ service, createOperationId: () => "op-fixed" });
    controller.start();
    await advance(250);

    // Another client (e.g. a stale tab) already used this ID for a different announcement.
    const elsewhere = service.publish("ann-101", "op-fixed");
    await settle(elsewhere);
    publish.mockClear();

    await settle(controller.publish("ann-102")); // service: OPERATION_ID_CONFLICT
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith("ann-102", "op-fixed");

    const attempt = attemptsOf(controller, "ann-102")[0];
    expect(attempt?.publishRequest).toBe("refused");
    expect(attempt?.issue?.kind).toBe("operation-conflict");
    const view = viewOf(controller, "ann-102");
    expect(view.kind).toBe("not-submitted");
    expect(view.latestRefusal?.operationId).toBe("op-fixed");
    expect(await serviceOps(service)).toHaveLength(1); // nothing was created for ann-102
    controller.stop();
  });

  it("never overwrites an already tracked attempt if an ID is generated twice", async () => {
    const service = createAnnouncementMock();
    const publish = vi.spyOn(service, "publish");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const controller = createWorkspaceController({ service, createOperationId: () => "op-fixed" });
    controller.start();
    await advance(250);
    await settle(controller.publish("ann-101"));
    await settle(controller.publish("ann-102"));
    expect(publish).toHaveBeenCalledTimes(1);
    expect(attemptsOf(controller, "ann-101")).toHaveLength(1);
    expect(attemptsOf(controller, "ann-102")).toHaveLength(0);
    controller.stop();
  });
});

describe("polling lifecycle", () => {
  it("shares one request between concurrent status checks", async () => {
    const { service, controller } = await startController("lost-response");
    await settle(controller.publish("ann-101"));
    const id = attemptsOf(controller, "ann-101")[0]?.operationId ?? "";
    const getStatus = vi.spyOn(service, "getStatus");
    const checks = [controller.checkStatus(id), controller.checkStatus(id)];
    expect(attemptsOf(controller, "ann-101")[0]?.checking).toBe(true);
    await advance(150);
    await Promise.all(checks);
    expect(getStatus).toHaveBeenCalledTimes(1);
    expect(attemptsOf(controller, "ann-101")[0]?.checking).toBe(false);
    controller.stop();
  });

  it("start() is idempotent: repeated starts (StrictMode) do not stack polling loops", async () => {
    const { service, controller } = await startController("success");
    await settle(controller.publish("ann-101"));
    const getStatus = vi.spyOn(service, "getStatus");
    controller.start();
    controller.start();
    controller.stop();
    controller.start();
    await advance(150);
    expect(getStatus).toHaveBeenCalledTimes(1); // four start/stop calls, one status request
    controller.stop();
  });

  it("stop() cancels timers", async () => {
    const { service, controller } = await startController("success");
    await settle(controller.publish("ann-101"));
    controller.stop();
    const getStatus = vi.spyOn(service, "getStatus");
    await advance(20_000);
    expect(getStatus).not.toHaveBeenCalled();
  });

  it("start() after stop() catches up immediately", async () => {
    const { service, controller } = await startController("success");
    await settle(controller.publish("ann-101"));
    controller.stop();
    await advance(4_000);
    const getStatus = vi.spyOn(service, "getStatus");
    controller.start();
    await advance(200);
    expect(getStatus).toHaveBeenCalledTimes(1);
    expect(viewOf(controller, "ann-101").kind).toBe("published");
    controller.stop();
  });
});

describe("unexpected failures", () => {
  it("an unrecognised publish error is treated as 'outcome unknown', never as a rejection", async () => {
    const service = createAnnouncementMock();
    vi.spyOn(service, "publish").mockRejectedValue(new Error("socket closed"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const controller = createWorkspaceController({ service });
    controller.start();
    await advance(250);
    await settle(controller.publish("ann-101"));
    expect(viewOf(controller, "ann-101").kind).toBe("unconfirmed");
    expect(attemptsOf(controller, "ann-101")[0]?.publishRequest).toBe("unconfirmed");
    controller.stop();
  });

  it("a failed announcement load is retryable and does not enable publishing", async () => {
    const service = createAnnouncementMock();
    vi.spyOn(service, "getAnnouncements").mockRejectedValueOnce(new Error("offline"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const controller = createWorkspaceController({ service });
    controller.start();
    await advance(250);
    expect(controller.getState().announcements.status).toBe("failed");
    await settle(controller.publish("ann-101"));
    expect(attemptsOf(controller, "ann-101")).toHaveLength(0);

    const retry = controller.loadWorkspace();
    await advance(150);
    await retry;
    expect(controller.getState().announcements.status).toBe("ready");
    controller.stop();
  });
});
