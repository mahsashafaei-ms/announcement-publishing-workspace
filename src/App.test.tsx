import { StrictMode } from "react";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AnnouncementMockError, createAnnouncementMock } from "./mocks";
import type { AnnouncementScenario } from "./mocks";
import { App } from "./App";
import { advance, installMockClock } from "./test/helpers";

installMockClock();

const user = () => userEvent.setup({ delay: null, advanceTimers: (ms) => vi.advanceTimersByTime(ms) });

const mount = async (scenario?: AnnouncementScenario) => {
  const service = createAnnouncementMock();
  if (scenario) service.setScenario(scenario);
  const view = render(
    <StrictMode>
      <App service={service} />
    </StrictMode>,
  ); // StrictMode, as in production
  await advance(250);
  return { service, ...view };
};

const nav = () => within(screen.getByRole("navigation", { name: "Announcements" }));
const listItem = (title: string) => nav().getByRole("button", { name: new RegExp(title) });
const select = async (u: ReturnType<typeof user>, title: string) => u.click(listItem(title));
const details = () => within(screen.getByRole("region", { name: /^Service|^New|^Support/ }));
const panel = () => within(screen.getByRole("region", { name: "Publication status" }));
const history = () => within(screen.getByRole("region", { name: /Publication history/ }));
const attemptCount = () => history().queryAllByText(/^Attempt \d+/).length;
const publishButton = () => details().getByRole("button", { name: /publish announcement|start a new attempt/i });
const automaticSwitch = () => screen.getByRole("switch", { name: "Automatic updates" });
const announcer = () => document.querySelector(".sr-only[role=status]");

describe("initial state", () => {
  it("shows the three announcements returned by the service with full content", async () => {
    await mount();
    expect(nav().getAllByRole("button")).toHaveLength(3);
    expect(screen.getByRole("heading", { level: 2, name: "Service Maintenance Notice" })).toBeInTheDocument();
    expect(
      screen.getByText(/briefly unavailable during the scheduled maintenance window/, { selector: "article p" }),
    ).toBeInTheDocument();
    expect(panel().getByText(/has not been submitted yet/)).toBeInTheDocument();
    expect(history().getByText("No attempts yet")).toBeInTheDocument();
    expect(screen.getByText("Workspace ready")).toBeInTheDocument();
    expect(automaticSwitch()).toHaveAttribute("aria-checked", "true");
  });

  it("shows a loading state before data arrives, without claiming anything about publications", () => {
    render(<App service={createAnnouncementMock()} />);
    expect(screen.getByText("Loading announcements…")).toBeInTheDocument();
    expect(screen.getByText("Restoring workspace…")).toBeInTheDocument();
    expect(screen.queryByText(/not been submitted/)).not.toBeInTheDocument();
  });

  it("offers a retry when announcements fail to load", async () => {
    const service = createAnnouncementMock();
    vi.spyOn(service, "getAnnouncements").mockRejectedValueOnce(new Error("offline"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(<App service={service} />);
    await advance(250);
    expect(screen.getByRole("alert")).toHaveTextContent("Announcements could not be loaded");
    await user().click(screen.getByRole("button", { name: "Retry loading" }));
    await advance(150);
    expect(screen.getByRole("heading", { level: 2, name: "Service Maintenance Notice" })).toBeInTheDocument();
  });
});

describe("selection", () => {
  it("marks the selected announcement and shows its own content", async () => {
    const u = user();
    await mount();
    expect(listItem("Service Maintenance Notice")).toHaveAttribute("aria-current", "true");
    await select(u, "Support Hours Update");
    expect(listItem("Support Hours Update")).toHaveAttribute("aria-current", "true");
    expect(listItem("Service Maintenance Notice")).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("heading", { level: 2, name: "Support Hours Update" })).toBeInTheDocument();
  });
});

describe("successful publication", () => {
  it("goes Sending → Processing → Published and then offers no publish action", async () => {
    const u = user();
    await mount("success");
    await u.click(publishButton());
    expect(panel().getByText("Sending your announcement")).toBeInTheDocument();

    await advance(300);
    expect(panel().getByText("Publication in progress")).toBeInTheDocument();
    expect(listItem("Service Maintenance Notice")).toHaveTextContent("Processing");

    await advance(4_000);
    expect(panel().getByText(/^publication-g1-op-/)).toBeInTheDocument();
    expect(listItem("Service Maintenance Notice")).toHaveTextContent("Published");
    expect(details().getByRole("button", { name: "Published" })).toBeDisabled();
    expect(details().getByText(/cannot be published again/)).toBeInTheDocument();
    expect(screen.getByText("01", { selector: "strong" })).toBeInTheDocument(); // the published counter
  });

  it("a double click creates a single attempt", async () => {
    const u = user();
    await mount("success");
    await u.dblClick(publishButton());
    await advance(300);
    expect(attemptCount()).toBe(1);
  });
});

describe("rejection and a deliberate new attempt", () => {
  it("shows the reason, keeps the rejected attempt, and a new attempt appears next to it", async () => {
    const u = user();
    const { service } = await mount("explicit-rejection");
    await u.click(publishButton());
    await advance(300);
    expect(panel().getByText("This announcement was declined by the publication service.")).toBeInTheDocument();
    expect(listItem("Service Maintenance Notice")).toHaveTextContent("Rejected");

    service.setScenario("success");
    await u.click(details().getByRole("button", { name: "Start a new attempt" }));
    await advance(300);
    expect(attemptCount()).toBe(2);
    expect(history().getByText("Rejected")).toBeInTheDocument(); // the first attempt is still there
    expect(history().getByText("Processing")).toBeInTheDocument();
  });
});

describe("lost response", () => {
  it("communicates an unconfirmed outcome and recovers through a manual status check", async () => {
    const u = user();
    await mount("lost-response");
    await u.click(publishButton());
    await advance(200);

    expect(listItem("Service Maintenance Notice")).toHaveTextContent("Outcome unconfirmed");
    expect(panel().getByText(/communication problem, not a\s+rejection/)).toBeInTheDocument();
    expect(panel().getByText(/may have accepted this publication/)).toBeInTheDocument();
    expect(details().getByRole("button", { name: "Resend publish request" })).toBeEnabled();
    expect(details().queryByRole("button", { name: /publish announcement/i })).not.toBeInTheDocument();

    await u.click(details().getByRole("button", { name: "Check status" }));
    expect(details().getByRole("button", { name: "Checking status…" })).toBeDisabled();
    await advance(150);
    expect(listItem("Service Maintenance Notice")).toHaveTextContent("Processing");
  });

  it("resending reuses the operation: the history still shows one attempt", async () => {
    const u = user();
    await mount("lost-response");
    await u.click(publishButton());
    await advance(200);
    await u.click(details().getByRole("button", { name: "Resend publish request" }));
    await advance(200);
    expect(attemptCount()).toBe(1);
    expect(listItem("Service Maintenance Notice")).toHaveTextContent("Processing");
  });
});

describe("status-check failure", () => {
  it("shows a temporary problem, not a rejection, and recovers on the next check", async () => {
    const u = user();
    await mount("status-check-failure");
    await u.click(publishButton());
    await advance(200);
    await u.click(details().getByRole("button", { name: "Check status" }));
    await advance(150);
    expect(panel().getByText("The service could not report the status right now.")).toBeInTheDocument();
    expect(listItem("Service Maintenance Notice")).toHaveTextContent("Outcome unconfirmed");

    await u.click(details().getByRole("button", { name: "Check status" }));
    await advance(150);
    expect(listItem("Service Maintenance Notice")).toHaveTextContent("Processing");
    expect(panel().queryByText("The service could not report the status right now.")).not.toBeInTheDocument();
  });
});

describe("independent announcements", () => {
  it("keeps results on the right announcement while switching and finishing out of order", async () => {
    const u = user();
    await mount("overlapping");
    await u.click(publishButton()); // ann-101: 10s
    await select(u, "New Feature Launch");
    expect(panel().getByText(/has not been submitted yet/)).toBeInTheDocument();
    await u.click(publishButton()); // ann-102: 2s
    await select(u, "Support Hours Update");
    await u.click(publishButton()); // ann-103: 6s
    await advance(1_000);
    for (const t of ["Service Maintenance Notice", "New Feature Launch", "Support Hours Update"]) {
      expect(listItem(t)).toHaveTextContent("Processing");
    }
    expect(screen.getByText("3 publications in progress")).toBeInTheDocument();

    await advance(3_000);
    expect(listItem("New Feature Launch")).toHaveTextContent("Published");
    expect(listItem("Service Maintenance Notice")).toHaveTextContent("Processing");

    await advance(8_000);
    expect(listItem("Support Hours Update")).toHaveTextContent("Published");
    expect(listItem("Service Maintenance Notice")).toHaveTextContent("Published");
    await select(u, "New Feature Launch");
    expect(panel().getByText(/^publication-g1-op-/)).toBeInTheDocument();
  });
});

describe("refresh recovery", () => {
  it("restores a processing publication after a refresh and follows it to completion", async () => {
    const u = user();
    const first = await mount("success");
    await u.click(publishButton());
    await advance(300);
    first.unmount(); // the page is gone, the mock keeps its records in sessionStorage

    await mount();
    expect(listItem("Service Maintenance Notice")).toHaveTextContent("Processing");
    expect(attemptCount()).toBe(1);
    await advance(4_000);
    expect(listItem("Service Maintenance Notice")).toHaveTextContent("Published");
  });

  it("after a failed recovery, says history is unavailable instead of 'not submitted' or 'no attempts'", async () => {
    // Reproduction: create an operation under status-check-failure, refresh before its first status read.
    const u = user();
    const first = await mount("status-check-failure");
    await u.click(publishButton());
    await advance(200);
    first.unmount();

    await mount();
    expect(screen.getByRole("alert")).toHaveTextContent("Publication history could not be restored");
    expect(screen.getByText("Workspace needs attention")).toBeInTheDocument();
    expect(screen.getByText("Publication history unknown")).toBeInTheDocument();
    for (const t of ["Service Maintenance Notice", "New Feature Launch", "Support Hours Update"]) {
      expect(listItem(t)).toHaveTextContent("History unavailable");
    }
    expect(screen.queryByText(/not been submitted/)).not.toBeInTheDocument();
    expect(screen.queryByText("No attempts yet")).not.toBeInTheDocument();
    expect(history().getByText("History unavailable")).toBeInTheDocument();
    expect(publishButton()).toBeDisabled();
    expect(details().getByText(/must be restored before a new attempt/)).toBeInTheDocument();
    expect(screen.queryByText("00", { selector: "strong" })).not.toBeInTheDocument(); // unknown is not zero

    await u.click(screen.getByRole("button", { name: "Retry loading" }));
    await advance(150);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(listItem("Service Maintenance Notice")).toHaveTextContent("Processing");
    expect(listItem("New Feature Launch")).toHaveTextContent("Not submitted"); // now supported by recovery
  });
});

describe("Automatic updates", () => {
  it("is on by default; when off, nothing follows automatically but Check status still works", async () => {
    const u = user();
    await mount("success");
    expect(screen.getByText(/update automatically/)).toBeInTheDocument();
    await u.click(automaticSwitch());
    expect(automaticSwitch()).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText(/Automatic checks are off/)).toBeInTheDocument();

    await u.click(publishButton());
    await advance(5_000); // long past completion on the service
    expect(listItem("Service Maintenance Notice")).toHaveTextContent("Processing");
    expect(details().getByText(/Automatic checks are paused/)).toBeInTheDocument();

    await u.click(details().getByRole("button", { name: "Check status" }));
    await advance(150);
    expect(listItem("Service Maintenance Notice")).toHaveTextContent("Published");
  });

  it("re-enabling catches up promptly", async () => {
    const u = user();
    await mount("success");
    await u.click(automaticSwitch());
    await u.click(publishButton());
    await advance(5_000);
    expect(listItem("Service Maintenance Notice")).toHaveTextContent("Processing");
    await u.click(automaticSwitch());
    await advance(150);
    expect(listItem("Service Maintenance Notice")).toHaveTextContent("Published");
  });

  it("a hidden tab pauses checks without turning the switch off, and visibility does not turn it back on", async () => {
    const u = user();
    await mount("success");
    const setHidden = (hidden: boolean) => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => (hidden ? "hidden" : "visible"),
      });
      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
    };
    setHidden(true);
    expect(screen.getByText(/paused while this tab is in the background/)).toBeInTheDocument();
    expect(automaticSwitch()).toHaveAttribute("aria-checked", "true");

    await u.click(automaticSwitch()); // the user turns it off while hidden
    setHidden(false);
    expect(automaticSwitch()).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText(/Automatic checks are off/)).toBeInTheDocument();
    setHidden(false);
    Reflect.deleteProperty(document, "visibilityState");
  });
});

describe("reset workspace", () => {
  const openReset = async (u: ReturnType<typeof user>) => {
    await u.click(screen.getByText("Simulation settings"));
    await u.click(screen.getByRole("button", { name: "Reset workspace" }));
    return within(screen.getByRole("alertdialog", { name: "Reset the workspace?" }));
  };

  it("Escape and Cancel close without resetting; focus starts on Cancel, is trapped and returns", async () => {
    const u = user();
    const { service } = await mount();
    const reset = vi.spyOn(service, "reset");
    const dialog = await openReset(u);
    expect(dialog.getByRole("button", { name: "Cancel" })).toHaveFocus();
    await u.tab();
    expect(dialog.getByRole("button", { name: "Reset all attempts" })).toHaveFocus();
    await u.tab();
    expect(dialog.getByRole("button", { name: "Cancel" })).toHaveFocus();
    await u.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset workspace" })).toHaveFocus();

    const again = await openReset(u);
    await u.click(again.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(reset).not.toHaveBeenCalled();
  });

  it("clears history and counters, restores the scenario and selection, and keeps the Automatic updates choice", async () => {
    const u = user();
    const { service } = await mount("success");
    await u.click(publishButton());
    await advance(4_000);
    await select(u, "Support Hours Update");
    await u.click(screen.getByText("Simulation settings"));
    await u.selectOptions(screen.getByLabelText("Scenario for new attempts"), "overlapping");
    await u.click(automaticSwitch()); // turned off before reset

    const dialog = await openReset(u);
    await u.click(dialog.getByRole("button", { name: "Reset all attempts" }));
    await advance(250);

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(service.getScenario()).toBe("success");
    expect(screen.getByLabelText("Scenario for new attempts")).toHaveValue("success");
    expect(listItem("Service Maintenance Notice")).toHaveAttribute("aria-current", "true");
    for (const t of ["Service Maintenance Notice", "New Feature Launch", "Support Hours Update"]) {
      expect(listItem(t)).toHaveTextContent("Not submitted");
    }
    expect(history().getByText("No attempts yet")).toBeInTheDocument();
    expect(screen.getByText("00", { selector: "strong" })).toBeInTheDocument();
    expect(automaticSwitch()).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText("Workspace reset. Attempts cleared and default scenario restored.")).toBeInTheDocument();
  });

  it("keeps the workspace and shows a retryable error when service.reset() throws", async () => {
    const u = user();
    const { service } = await mount("success");
    await u.click(publishButton());
    await advance(4_000);
    const reset = vi.spyOn(service, "reset").mockImplementationOnce(() => {
      throw new Error("storage unavailable");
    });

    const dialog = await openReset(u);
    await u.click(dialog.getByRole("button", { name: "Reset all attempts" }));
    expect(await dialog.findByRole("alert")).toHaveTextContent("could not be reset");
    expect(listItem("Service Maintenance Notice")).toHaveTextContent("Published");

    await u.click(dialog.getByRole("button", { name: "Reset all attempts" }));
    await advance(250);
    expect(reset).toHaveBeenCalledTimes(2);
    expect(listItem("Service Maintenance Notice")).toHaveTextContent("Not submitted");
  });

  it("disables both buttons while resetting, so it cannot be confirmed twice", async () => {
    const u = user();
    const { service } = await mount();
    const reset = vi.spyOn(service, "reset");
    const dialog = await openReset(u);
    await u.click(dialog.getByRole("button", { name: "Reset all attempts" }));
    expect(dialog.getByRole("button", { name: "Resetting…" })).toBeDisabled();
    expect(dialog.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await advance(250);
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("shows a loading problem, not the deleted history, when loading after reset fails", async () => {
    const u = user();
    const { service } = await mount("success");
    await u.click(publishButton());
    await advance(4_000);
    await u.click(automaticSwitch());
    vi.spyOn(service, "listOperations").mockRejectedValueOnce(new Error("down"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const dialog = await openReset(u);
    await u.click(dialog.getByRole("button", { name: "Reset all attempts" }));
    await advance(250);
    expect(screen.getByRole("alert")).toHaveTextContent("Publication history could not be restored");
    expect(listItem("Service Maintenance Notice")).toHaveTextContent("History unavailable");
    expect(screen.queryByText(/^publication-g/)).not.toBeInTheDocument();
  });
});

describe("accessibility", () => {
  it("announces terminal outcomes in a polite live region", async () => {
    const u = user();
    await mount("explicit-rejection");
    await u.click(publishButton());
    await advance(300);
    expect(announcer()).toHaveTextContent("Service Maintenance Notice: Rejected");
  });

  it("announces a background status-check failure while the publication stays Processing", async () => {
    const u = user();
    const { service } = await mount("success");
    await u.click(publishButton());
    await advance(300);
    expect(listItem("Service Maintenance Notice")).toHaveTextContent("Processing");
    vi.spyOn(service, "getStatus").mockRejectedValueOnce(
      new AnnouncementMockError("STATUS_UNAVAILABLE", "request-x", "op", "ann-101"),
    );
    await select(u, "New Feature Launch"); // the failure happens in the background
    await advance(1_500); // automatic check fails
    expect(listItem("Service Maintenance Notice")).toHaveTextContent("Processing");
    expect(announcer()).toHaveTextContent("Service Maintenance Notice: Status check failed");

    await select(u, "Support Hours Update"); // an ordinary re-render does not change the message
    expect(announcer()).toHaveTextContent("Service Maintenance Notice: Status check failed");
  });

  it("does not announce restored history after a refresh", async () => {
    const u = user();
    const first = await mount("success");
    await u.click(publishButton());
    await advance(4_000);
    first.unmount();
    await mount();
    expect(listItem("Service Maintenance Notice")).toHaveTextContent("Published");
    expect(announcer()).toHaveTextContent("");
  });

  it("clears a stale announcement after a workspace reset", async () => {
    const u = user();
    await mount("explicit-rejection");
    await u.click(publishButton());
    await advance(300);
    expect(announcer()).toHaveTextContent("Rejected");
    await u.click(screen.getByText("Simulation settings"));
    await u.click(screen.getByRole("button", { name: "Reset workspace" }));
    await u.click(screen.getByRole("button", { name: "Reset all attempts" }));
    await advance(250);
    expect(listItem("Service Maintenance Notice")).toHaveTextContent("Not submitted");
    expect(announcer()).toHaveTextContent("");
  });
});
