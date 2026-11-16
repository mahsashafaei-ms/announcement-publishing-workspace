import { StrictMode } from "react";
import { act, render } from "@testing-library/react";
import type { PublicationView } from "../domain/selectors";
import type { Issue } from "../domain/types";
import { processing, published, record } from "../test/fixtures";
import { StatusAnnouncer } from "./StatusAnnouncer";

const announcements = [
  { id: "ann-101", title: "One", body: "" },
  { id: "ann-102", title: "Two", body: "" },
];
const statusFailure = (requestId: string, operationId = "op-1"): Issue => ({
  kind: "status-unavailable",
  requestId,
  detail: "",
  occurredAt: `t-${operationId}-${requestId}`,
});
const processingView = (
  issue: Issue | null = null,
  operationId = "op-1",
  announcementId = "ann-101",
): PublicationView => ({
  kind: "processing",
  attempt: record({
    operationId,
    announcementId,
    publishRequest: "accepted",
    snapshot: processing(operationId, announcementId),
    issue,
  }),
  latestRefusal: null,
});
const publishedView = (operationId = "op-1", announcementId = "ann-101"): PublicationView => {
  const snapshot = published(operationId, announcementId);
  if (snapshot.status !== "published") throw new Error("fixture");
  return {
    kind: "published",
    attempt: record({ operationId, announcementId, publishRequest: "accepted", snapshot }),
    snapshot,
    latestRefusal: null,
  };
};
const notSubmitted: PublicationView = { kind: "not-submitted", latestRefusal: null };

const ui = (first: PublicationView, ready = true, second: PublicationView = notSubmitted) => (
  <StrictMode>
    <StatusAnnouncer
      announcements={announcements}
      views={
        new Map([
          ["ann-101", first],
          ["ann-102", second],
        ])
      }
      ready={ready}
    />
  </StrictMode>
);

/** Records the region's text after every real content change (attribute changes are not observed). */
const observeRegion = (region: Element) => {
  const texts: string[] = [];
  const observer = new MutationObserver(() => texts.push(region.textContent ?? ""));
  observer.observe(region, { childList: true, characterData: true, subtree: true });
  return { texts, flush: async () => observer.takeRecords().length && texts.push(region.textContent ?? ""), observer };
};

const settle = async (ms = 1_000) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

describe("StatusAnnouncer (rendered live region)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const mount = (first: PublicationView, second: PublicationView = notSubmitted) => {
    const view = render(ui(first, true, second));
    const region = view.getByRole("status");
    return { ...view, region, watch: observeRegion(region) };
  };

  it("keeps a single live region with polite, atomic semantics", () => {
    const { region } = mount(processingView());
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toHaveAttribute("aria-atomic", "true");
  });

  it("announces a new status-check issue while the publication stays Processing", async () => {
    const { rerender, region } = mount(processingView());
    rerender(ui(processingView(statusFailure("r1"))));
    await settle();
    expect(region).toHaveTextContent("One: Status check failed");
  });

  it("produces a second content update for a distinct failure with identical text", async () => {
    const { rerender, region, watch } = mount(processingView());
    rerender(ui(processingView(statusFailure("r1"))));
    await settle();
    rerender(ui(processingView(statusFailure("r2")))); // a new request failed the same way
    await settle();
    await watch.flush();
    watch.observer.disconnect();
    const written = watch.texts.filter((text) => text === "One: Status check failed");
    expect(written).toHaveLength(2); // the text was written twice ...
    expect(watch.texts.indexOf("")).toBeGreaterThan(-1); // ... with the region emptied in between
    expect(region).toHaveTextContent("One: Status check failed");
  });

  it("does not announce the same issue again on ordinary rerenders", async () => {
    const { rerender, watch } = mount(processingView());
    rerender(ui(processingView(statusFailure("r1"))));
    await settle();
    const before = watch.texts.length;
    rerender(ui(processingView(statusFailure("r1")))); // new objects, same event
    rerender(ui(processingView(statusFailure("r1"))));
    await settle();
    await watch.flush();
    expect(watch.texts.length).toBe(before);
  });

  it("does not suppress a new operation's event because its message matches the previous one", async () => {
    const { rerender, watch } = mount(processingView());
    rerender(ui(processingView(statusFailure("r1", "op-1"))));
    await settle();
    rerender(ui(processingView(null, "op-2")));
    rerender(ui(processingView(statusFailure("r1", "op-2"), "op-2")));
    await settle();
    await watch.flush();
    expect(watch.texts.filter((text) => text === "One: Status check failed")).toHaveLength(2);
  });

  it("stays silent for initial hydration", async () => {
    const view = render(ui(publishedView(), false));
    const region = view.getByRole("status");
    view.rerender(ui(publishedView(), true)); // history restored: existing state, not a new event
    await settle();
    expect(region).toHaveTextContent("");
  });

  it("reset clears the region and a pending write cannot bring stale text back", async () => {
    const { rerender, region } = mount(processingView());
    rerender(ui(processingView(statusFailure("r1")))); // write is pending
    rerender(ui(processingView(statusFailure("r1")), false)); // reset before it lands
    await settle();
    expect(region).toHaveTextContent("");
  });

  it("a confirmed outcome supersedes a pending failure announcement", async () => {
    const { rerender, region, watch } = mount(processingView());
    rerender(ui(processingView(statusFailure("r1")))); // pending
    rerender(ui(publishedView())); // confirmed before the failure text was written
    await settle();
    await watch.flush();
    expect(region).toHaveTextContent("One: Published");
    expect(watch.texts).not.toContain("One: Status check failed");
  });

  it("keeps a pending outcome when another announcement starts processing", async () => {
    const { rerender, region } = mount(processingView());
    rerender(ui(publishedView()));
    rerender(ui(publishedView(), true, processingView(null, "op-2", "ann-102")));
    await settle();
    expect(region).toHaveTextContent("One: Published");
  });

  it("announces both independent outcomes when they arrive before the region is repopulated", async () => {
    const second = processingView(null, "op-2", "ann-102");
    const { rerender, watch } = mount(processingView(), second);
    rerender(ui(publishedView(), true, second));
    rerender(ui(publishedView(), true, publishedView("op-2", "ann-102")));
    await settle();
    await watch.flush();
    const announced = watch.texts.join(" ");
    expect(announced).toContain("One: Published");
    expect(announced).toContain("Two: Published");
  });

  it("supersedes one operation's pending failure without losing another operation's outcome", async () => {
    const second = processingView(null, "op-2", "ann-102");
    const { rerender, watch } = mount(processingView(), second);
    rerender(ui(processingView(statusFailure("r1")), true, second));
    rerender(ui(processingView(statusFailure("r1")), true, publishedView("op-2", "ann-102")));
    rerender(ui(publishedView(), true, publishedView("op-2", "ann-102")));
    await settle();
    await watch.flush();
    const announced = watch.texts.join(" ");
    expect(announced).toContain("One: Published");
    expect(announced).toContain("Two: Published");
    expect(announced).not.toContain("Status check failed");
  });

  it("does not replay a delivered outcome when another announcement later starts processing", async () => {
    const { rerender, watch } = mount(processingView());
    rerender(ui(publishedView()));
    await settle();
    rerender(ui(publishedView(), true, processingView(null, "op-2", "ann-102")));
    await settle();
    await watch.flush();
    expect(watch.texts.filter((text) => text.includes("One: Published"))).toHaveLength(1);
  });

  it("drops a pending issue that a successful check has already resolved", async () => {
    const { rerender, region, watch } = mount(processingView());
    rerender(ui(processingView(statusFailure("r1"))));
    rerender(ui(processingView()));
    await settle();
    await watch.flush();
    expect(region).toBeEmptyDOMElement();
    expect(watch.texts.join(" ")).not.toContain("Status check failed");
  });

  it("discards all pending outcomes on reset, even when the workspace becomes ready again", async () => {
    const second = processingView(null, "op-2", "ann-102");
    const { rerender, region, watch } = mount(processingView(), second);
    rerender(ui(publishedView(), true, second));
    rerender(ui(publishedView(), true, publishedView("op-2", "ann-102")));
    rerender(ui(notSubmitted, false));
    rerender(ui(notSubmitted));
    await settle();
    await watch.flush();
    expect(region).toBeEmptyDOMElement();
    expect(watch.texts.join(" ")).not.toContain("Published");
  });

  it("cleans up pending work on unmount", async () => {
    const { rerender, unmount } = mount(processingView());
    rerender(ui(processingView(statusFailure("r1"))));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    await settle();
  });
});
