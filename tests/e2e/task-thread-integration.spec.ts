import { expect, test } from "@playwright/test";
import { dateKey, seedState, seedThread, seedThreadTask, seedTodo } from "./helpers";

test("adds a dated task to an existing thread and navigates through the thread indicator", async ({ page }) => {
  const today = dateKey();
  await seedState(page, {
    todosByDate: {
      [today]: [seedTodo({ id: "task-1", text: "Thread me", sourceDate: today, referenceId: "thread-me-ref" })],
    },
    threads: [seedThread({ id: "thread-1", title: "Integration thread" })],
  });

  await page.goto("/");
  await page.getByLabel("Open task menu or long-press to reorder").click();
  await page.getByRole("menuitem", { name: "Add to thread" }).click();
  await page.getByRole("button", { name: /Integration thread/ }).click();

  await expect(page.getByLabel("Show thread for Thread me")).toBeVisible();
  await page.getByLabel("Show thread for Thread me").click();
  await page.getByRole("menuitem", { name: "Integration thread" }).click();

  await expect(page).toHaveURL(/\/thread\/\?threadId=thread-1/);
  await expect(page.locator("textarea.task-text-input")).toHaveValue("Thread me");
});

test("completing a dated task completes the linked thread task", async ({ page }) => {
  const today = dateKey();
  await seedState(page, {
    todosByDate: {
      [today]: [
        seedTodo({
          id: "dated-task",
          text: "Linked completion",
          sourceDate: today,
          referenceId: "linked-ref",
          threadId: "thread-1",
          threadTaskId: "thread-task",
        }),
      ],
    },
    threads: [
      seedThread({
        id: "thread-1",
        title: "Linked thread",
        tasks: [seedThreadTask({ id: "thread-task", text: "Linked completion", referenceId: "linked-ref" })],
      }),
    ],
  });

  await page.goto("/");
  await page.locator("input.todo-checkbox").check();
  await page.getByLabel("Show thread for Linked completion").click();
  await page.getByRole("menuitem", { name: "Linked thread" }).click();

  await expect(page.locator("input.todo-checkbox")).toBeChecked();
  await expect(page.getByText("1 Completed item")).toBeVisible();
});

test("completing a thread task completes the linked dated task", async ({ page }) => {
  const today = dateKey();
  await seedState(page, {
    todosByDate: {
      [today]: [
        seedTodo({
          id: "dated-task",
          text: "Thread completion",
          sourceDate: today,
          referenceId: "thread-completion-ref",
          threadId: "thread-1",
          threadTaskId: "thread-task",
        }),
      ],
    },
    threads: [
      seedThread({
        id: "thread-1",
        title: "Completion thread",
        tasks: [seedThreadTask({ id: "thread-task", text: "Thread completion", referenceId: "thread-completion-ref" })],
      }),
    ],
  });

  await page.goto("/thread?threadId=thread-1");
  await page.locator("input.todo-checkbox").check();
  await page.getByRole("link", { name: "Tasks" }).click();

  await expect(page.locator("input.todo-checkbox")).toBeChecked();
  await expect(page.getByText("1 Completed item")).toBeVisible();
});

test("deleting a thread task removes the linked dated task", async ({ page }) => {
  const today = dateKey();
  await seedState(page, {
    todosByDate: {
      [today]: [
        seedTodo({
          id: "dated-task",
          text: "Delete linked task",
          sourceDate: today,
          referenceId: "delete-linked-ref",
          threadId: "thread-1",
          threadTaskId: "thread-task",
        }),
      ],
    },
    threads: [
      seedThread({
        id: "thread-1",
        title: "Delete linked thread",
        tasks: [seedThreadTask({ id: "thread-task", text: "Delete linked task", referenceId: "delete-linked-ref" })],
      }),
    ],
  });

  await page.goto("/thread?threadId=thread-1");
  await page.getByLabel("Open task menu").click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("link", { name: "Tasks" }).click();

  await expect(page.getByText("No open tasks for this day.")).toBeVisible();
  await expect(page.getByText("Delete linked task")).toHaveCount(0);
});

test("deleting a thread removes related dated thread tasks", async ({ page }) => {
  const today = dateKey();
  await seedState(page, {
    todosByDate: {
      [today]: [
        seedTodo({
          id: "dated-task",
          text: "Delete with thread",
          sourceDate: today,
          referenceId: "delete-thread-ref",
          threadId: "thread-1",
          threadTaskId: "thread-task",
        }),
      ],
    },
    threads: [
      seedThread({
        id: "thread-1",
        title: "Delete containing thread",
        tasks: [seedThreadTask({ id: "thread-task", text: "Delete with thread", referenceId: "delete-thread-ref" })],
      }),
    ],
  });

  await page.goto("/thread?threadId=thread-1");
  await page.getByRole("button", { name: "Open thread menu" }).click();
  page.once("dialog", async (dialog) => {
    await dialog.accept();
  });
  await page.getByRole("menuitem", { name: "Delete" }).click();

  await page.getByRole("link", { name: "Tasks" }).click();
  await expect(page.getByText("No open tasks for this day.")).toBeVisible();
  await expect(page.getByText("Delete with thread")).toHaveCount(0);
});
