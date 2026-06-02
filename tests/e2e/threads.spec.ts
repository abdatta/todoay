import { expect, test } from "@playwright/test";
import { dateKey, dayOfMonth, seedState, seedThread, seedThreadTask } from "./helpers";

const activeDay = (page: import("@playwright/test").Page, date: string) =>
  page.locator(".datepicker-day:not(.datepicker-day-outside)", { hasText: new RegExp(`^${dayOfMonth(date)}$`) });

const threadRow = (page: import("@playwright/test").Page, title: string) =>
  page.locator(".thread-list-row", { hasText: title });

test("handles empty and canceled thread drafts", async ({ page }) => {
  await seedState(page);
  await page.goto("/threads");

  await page.getByRole("button", { name: "Create new thread" }).click();
  await expect(page.getByLabel("New thread title")).toBeFocused();
  await page.getByRole("heading", { name: "Threads" }).click();
  await expect(page.getByText("No threads yet.")).toBeVisible();

  await page.getByRole("button", { name: "Create new thread" }).click();
  await page.getByLabel("New thread title").fill("Canceled draft");
  await page.getByLabel("New thread title").press("Escape");
  await expect(page.getByText("Canceled draft")).toHaveCount(0);
});

test("creates, renames, pins, unpins, archives, restores, and tracks progress for a thread", async ({ page }) => {
  await seedState(page);
  await page.goto("/threads");

  await page.getByRole("button", { name: "Create new thread" }).click();
  await page.getByLabel("New thread title").fill("Release checklist");
  await page.getByLabel("New thread title").press("Enter");
  await expect(page).toHaveURL(/\/thread\/\?threadId=/);

  await page.getByLabel("Thread title").fill("Renamed release");
  await page.getByLabel("Thread title").press("Enter");
  await page.getByRole("button", { name: /add item/i }).click();
  await page.locator("textarea.task-text-input").fill("Ship the first test suite");
  await page.locator("input.todo-checkbox").check();

  await page.getByRole("button", { name: "Back to threads" }).click();
  await expect(page.getByRole("link", { name: /Renamed release/ })).toBeVisible();
  await expect(page.getByText(/0 open tasks .* Progressed now/)).toBeVisible();

  await threadRow(page, "Renamed release").getByLabel("Pin thread").click();
  await expect(threadRow(page, "Renamed release").getByLabel("Unpin thread")).toBeVisible();
  await threadRow(page, "Renamed release").getByLabel("Unpin thread").click();
  await expect(threadRow(page, "Renamed release").getByLabel("Pin thread")).toBeVisible();

  await threadRow(page, "Renamed release").getByLabel("Archive thread").click();
  await expect(page.getByRole("button", { name: /Archived/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Renamed release/ })).toHaveCount(0);

  await page.getByRole("button", { name: /Archived/ }).click();
  await expect(page.getByRole("link", { name: /Renamed release/ })).toBeVisible();
  await threadRow(page, "Renamed release").getByLabel("Restore thread").click();
  await expect(threadRow(page, "Renamed release").getByLabel("Archive thread")).toBeVisible();
});

test("deletes a thread with confirmation and supports canceling deletion", async ({ page }) => {
  await seedState(page, {
    threads: [
      seedThread({ id: "delete-thread", title: "Delete thread" }),
      seedThread({ id: "cancel-thread", title: "Cancel delete thread", sortOrder: 2048 }),
    ],
  });

  await page.goto("/thread?threadId=cancel-thread");
  await page.getByRole("button", { name: "Open thread menu" }).click();
  page.once("dialog", async (dialog) => {
    await dialog.dismiss();
  });
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(page.getByLabel("Thread title")).toHaveValue("Cancel delete thread");

  await page.goto("/thread?threadId=delete-thread");
  await page.getByRole("button", { name: "Open thread menu" }).click();
  page.once("dialog", async (dialog) => {
    await dialog.accept();
  });
  await page.getByRole("menuitem", { name: "Delete" }).click();

  await expect(page).toHaveURL(/\/threads/);
  await expect(page.getByRole("link", { name: /Delete thread/ })).toHaveCount(0);
});

test("supports thread task keyboard flow, completion, deletion, and duration persistence", async ({ page }) => {
  await seedState(page, {
    threads: [seedThread({ id: "thread-1", title: "Thread tasks" })],
  });

  await page.goto("/thread?threadId=thread-1");
  await page.getByRole("button", { name: /add item/i }).click();
  await page.locator("textarea.task-text-input").first().fill("First thread task");
  await page.locator("textarea.task-text-input").first().press("Enter");
  await expect(page.locator("textarea.task-text-input")).toHaveCount(2);
  await expect(page.locator("textarea.task-text-input").last()).toBeFocused();

  await page.locator("textarea.task-text-input").last().press("Backspace");
  await expect(page.locator("textarea.task-text-input")).toHaveCount(1);
  await expect(page.locator("textarea.task-text-input").first()).toBeFocused();

  await page.getByLabel("Estimated task duration in minutes").fill("35");
  await page.locator("input.todo-checkbox").check();
  await expect(page.getByText("1 Completed item")).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Estimated task duration in minutes")).toHaveValue("35");

  await page.getByLabel("Open task menu").click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(page.locator("textarea.task-text-input")).toHaveCount(0);
});

test("schedules thread tasks to dates and navigates from scheduled indicators", async ({ page }) => {
  const today = dateKey();
  await seedState(page, {
    threads: [
      seedThread({
        id: "thread-1",
        title: "Schedule thread",
        tasks: [seedThreadTask({ id: "task-1", text: "Scheduled thread task" })],
      }),
    ],
  });

  await page.goto("/thread?threadId=thread-1");
  await page.getByLabel("Open task menu").click();
  await page.getByRole("menuitem", { name: "Add to day" }).click();
  await activeDay(page, today).click();

  await expect(page.getByLabel("Show scheduled dates for Scheduled thread task")).toBeVisible();
  await page.getByRole("link", { name: "Tasks" }).click();
  await expect(page.locator("textarea.task-text-input")).toHaveValue("Scheduled thread task");

  await page.getByRole("link", { name: "Threads" }).click();
  await page.getByRole("link", { name: /Schedule thread/ }).click();
  await page.getByLabel("Show scheduled dates for Scheduled thread task").click();
  await page.getByRole("menuitem", { name: "Today" }).click();
  await expect(page.locator("textarea.task-text-input")).toHaveValue("Scheduled thread task");
});

test("keeps archived threads read-only", async ({ page }) => {
  await seedState(page, {
    threads: [
      seedThread({
        id: "archived-thread",
        title: "Archived thread",
        archived: true,
        tasks: [seedThreadTask({ id: "archived-task", text: "Archived task" })],
      }),
    ],
  });

  await page.goto("/thread?threadId=archived-thread");

  await expect(page.locator("textarea.task-text-input")).toHaveAttribute("readonly", "");
  await expect(page.locator("input.todo-checkbox")).toBeDisabled();
  await expect(page.getByRole("button", { name: /archived thread/i })).toBeDisabled();
  await expect(page.getByLabel("Open task menu")).toBeDisabled();
});
