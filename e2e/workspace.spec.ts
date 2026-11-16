import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

// Real browser, real timers, the real supplied mock. Each test gets a fresh browser context,
// so the mock's sessionStorage starts empty.

const LONG = { timeout: 15_000 };

const item = (page: Page, title: string): Locator =>
  page.getByRole("navigation", { name: "Announcements" }).getByRole("button", { name: new RegExp(title) });
const panel = (page: Page): Locator => page.locator("#announcement-details");
const history = (page: Page): Locator => page.getByRole("region", { name: /Publication history/ });
const status = (page: Page): Locator => page.getByRole("region", { name: "Publication status" });
const setScenario = async (page: Page, scenario: string) => {
  const select = page.getByLabel("Scenario for new attempts");
  if (!(await select.isVisible())) await page.getByText("Simulation settings").click(); // <details> toggles on click
  await select.selectOption(scenario);
};

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(item(page, "Service Maintenance Notice")).toBeVisible();
  await expect(page.getByText("Workspace ready")).toBeVisible();
});

test("publishes an announcement and offers no way to publish it again", async ({ page }) => {
  await panel(page).getByRole("button", { name: "Publish announcement" }).click();
  await expect(item(page, "Service Maintenance Notice")).toContainText("Processing");
  await expect(item(page, "Service Maintenance Notice")).toContainText("Published", LONG);
  await expect(status(page).getByText(/^publication-g1-op-/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Publish announcement|Start a new attempt/ })).toHaveCount(0);
});

test("publishes two announcements concurrently and keeps each result on its own announcement", async ({ page }) => {
  await panel(page).getByRole("button", { name: "Publish announcement" }).click();
  await item(page, "New Feature Launch").click();
  await expect(status(page).getByText(/has not been submitted yet/)).toBeVisible();
  await panel(page).getByRole("button", { name: "Publish announcement" }).click();

  await expect(item(page, "Service Maintenance Notice")).toContainText("Published", LONG);
  await expect(item(page, "New Feature Launch")).toContainText("Published", LONG);
  await expect(item(page, "Support Hours Update")).toContainText("Not submitted");
  await item(page, "Service Maintenance Notice").click();
  await expect(status(page).getByText(/^publication-g1-op-/)).toBeVisible();
});

test("recovers a publication that was processing when the page was refreshed", async ({ page }) => {
  await panel(page).getByRole("button", { name: "Publish announcement" }).click();
  await expect(item(page, "Service Maintenance Notice")).toContainText("Processing");

  await page.reload();
  await expect(item(page, "Service Maintenance Notice")).toContainText("Processing");
  await expect(history(page).getByText(/^Attempt \d+/)).toHaveCount(1);
  await expect(item(page, "Service Maintenance Notice")).toContainText("Published", LONG);

  await page.reload();
  await expect(item(page, "Service Maintenance Notice")).toContainText("Published"); // terminal outcome survives refresh
});

test("recovers from a lost publish response using the same operation", async ({ page }) => {
  await setScenario(page, "lost-response");
  await panel(page).getByRole("button", { name: "Publish announcement" }).click();

  await expect(item(page, "Service Maintenance Notice")).toContainText("Outcome unconfirmed");
  await expect(status(page).getByText(/communication problem, not a rejection/)).toBeVisible();
  await panel(page).getByRole("button", { name: "Check status" }).click();
  await expect(item(page, "Service Maintenance Notice")).toContainText("Processing");
  await expect(item(page, "Service Maintenance Notice")).toContainText("Published", LONG);
  await expect(history(page).getByText(/^Attempt \d+/)).toHaveCount(1);
});

test("shows a rejection reason and allows a deliberate new attempt that keeps the old one", async ({ page }) => {
  await setScenario(page, "explicit-rejection");
  await panel(page).getByRole("button", { name: "Publish announcement" }).click();
  await expect(status(page).getByText("This announcement was declined by the publication service.")).toBeVisible();

  await setScenario(page, "success");
  await panel(page).getByRole("button", { name: "Start a new attempt" }).click();

  await expect(history(page).getByText(/^Attempt \d+/)).toHaveCount(2);
  await expect(history(page).getByText("Rejected")).toBeVisible();
  await expect(item(page, "Service Maintenance Notice")).toContainText("Published", LONG);
});

test("resets the workspace after confirmation and keeps the Automatic updates choice", async ({ page }) => {
  await panel(page).getByRole("button", { name: "Publish announcement" }).click();
  await expect(item(page, "Service Maintenance Notice")).toContainText("Published", LONG);
  const automatic = page.getByRole("switch", { name: "Automatic updates" });
  await automatic.click();
  await expect(automatic).toHaveAttribute("aria-checked", "false");

  await page.getByText("Simulation settings").click();
  await page.getByRole("button", { name: "Reset workspace" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Reset the workspace?" });
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  // Real browsers move focus out of an inert page; focus must still return to the opener.
  await expect(page.getByRole("button", { name: "Reset workspace" })).toBeFocused();
  await expect(item(page, "Service Maintenance Notice")).toContainText("Published");

  await page.getByRole("button", { name: "Reset workspace" }).click();
  await dialog.getByRole("button", { name: "Reset all attempts" }).click();
  await expect(dialog).toBeHidden();
  await expect(item(page, "Service Maintenance Notice")).toContainText("Not submitted");
  await expect(automatic).toHaveAttribute("aria-checked", "false");
  await expect(page.getByLabel("Scenario for new attempts")).toHaveValue("success");
});

test("reports unavailable history, not 'not submitted', when recovery fails after a refresh", async ({ page }) => {
  await setScenario(page, "status-check-failure");
  for (const title of ["Service Maintenance Notice", "New Feature Launch", "Support Hours Update"]) {
    await item(page, title).click();
    await panel(page).getByRole("button", { name: "Publish announcement" }).click();
  }
  await page.reload(); // three pending status failures: the first list reads fail
  await expect(page.getByRole("alert")).toContainText("Publication history could not be restored");
  await expect(item(page, "Service Maintenance Notice")).toContainText("History unavailable");
  await expect(page.getByText(/has not been submitted yet/)).toHaveCount(0);
  await expect(item(page, "Service Maintenance Notice")).not.toContainText("History unavailable", LONG); // retried with backoff
});
