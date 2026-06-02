import { expect, test } from "@playwright/test";
import { dateKey, seedNote, seedState, seedThread, seedTodo } from "./helpers";

test("navigates between main app areas with the bottom nav", async ({ page }) => {
  await seedState(page);
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();
  await page.getByRole("link", { name: "Threads" }).click();
  await expect(page.getByRole("heading", { name: "Threads" })).toBeVisible();

  await page.getByRole("link", { name: "Notes" }).click();
  await expect(page.getByRole("heading", { name: "Notes" })).toBeVisible();

  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

  await page.getByRole("link", { name: "Tasks" }).click();
  await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();
});

test("shows a not-found state for an unknown thread id", async ({ page }) => {
  await seedState(page);
  await page.goto("/thread?threadId=missing-thread");

  await expect(page.getByRole("heading", { name: "Thread not found" })).toBeVisible();
  await expect(page.getByText("This thread is no longer available.")).toBeVisible();
});

test("restores localStorage state after reloading each main route", async ({ page }) => {
  const today = dateKey();
  await seedState(page, {
    todosByDate: {
      [today]: [seedTodo({ id: "task-1", text: "Reloaded task", sourceDate: today })],
    },
    noteIdsByDate: {
      [today]: ["note-1"],
    },
    noteDocs: {
      "note-1": seedNote({ id: "note-1", content: "Reloaded note" }),
    },
    threads: [seedThread({ id: "thread-1", title: "Reloaded thread" })],
    copyToBehavior: "value",
  });

  await page.goto("/");
  await page.reload();
  await expect(page.locator("textarea.task-text-input")).toHaveValue("Reloaded task");

  await page.goto("/threads");
  await page.reload();
  await expect(page.getByRole("link", { name: /Reloaded thread/ })).toBeVisible();

  await page.goto("/notes");
  await page.reload();
  await expect(page.locator("textarea.note-textarea")).toHaveValue("Reloaded note");

  await page.goto("/settings");
  await page.reload();
  await expect(page.getByRole("switch", { name: "Copy To keeps copies linked" })).toHaveAttribute("aria-checked", "false");
});

test("keeps critical controls visible on mobile viewports", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedState(page, {
    todosByDate: {
      [dateKey()]: [seedTodo({ id: "task-1", text: "Mobile task", sourceDate: dateKey() })],
    },
    threads: [seedThread({ id: "thread-1", title: "Mobile thread" })],
    noteIdsByDate: {
      [dateKey()]: ["note-1"],
    },
    noteDocs: {
      "note-1": seedNote({ id: "note-1", content: "Mobile note" }),
    },
  });

  await page.goto("/");
  await expect(page.getByRole("button", { name: /add item/i })).toBeInViewport();
  await expect(page.getByRole("navigation")).toBeInViewport();

  await page.getByRole("link", { name: "Threads" }).click();
  await expect(page.getByRole("button", { name: "Create new thread" })).toBeInViewport();
  await expect(page.getByRole("navigation")).toBeInViewport();

  await page.getByRole("link", { name: "Notes" }).click();
  await expect(page.getByRole("button", { name: /add another note/i })).toBeInViewport();
  await expect(page.getByRole("navigation")).toBeInViewport();

  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByLabel("Dark mode preference")).toBeInViewport();
  await expect(page.getByRole("navigation")).toBeInViewport();
});
