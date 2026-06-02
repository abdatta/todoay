import { expect, test, type Page } from "@playwright/test";
import {
  dateKey,
  dayOfMonth,
  getStoredState,
  seedState,
  seedThread,
  seedThreadTask,
  seedTodo,
} from "./helpers";

const disableCssMotion = async (page: Page) => {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
        scroll-behavior: auto !important;
      }
    `,
  });
};

const openBacklog = async (page: Page) => {
  await page.goto("/");
  await disableCssMotion(page);

  const trigger = page.locator(".datepicker-trigger");
  await expect(trigger).toBeVisible();
  await trigger.click();

  const backlogButton = page.getByRole("button", { name: "Backlog" });
  await expect(backlogButton).toBeVisible();
  await backlogButton.click();

  await expect(page.locator(".datepicker-trigger")).toHaveText("Backlog");
};

const activeDay = (page: import("@playwright/test").Page, date: string) =>
  page.locator(".datepicker-day:not(.datepicker-day-outside)", { hasText: new RegExp(`^${dayOfMonth(date)}$`) });

test("filters backlog tasks that are future or already scheduled forward", async ({ page }) => {
  const yesterday = dateKey(-1);
  const tomorrow = dateKey(1);
  await seedState(page, {
    todosByDate: {
      [yesterday]: [
        seedTodo({ id: "shown", text: "Visible backlog", sourceDate: yesterday, referenceId: "shown-ref" }),
        seedTodo({ id: "linked-past", text: "Linked forward", sourceDate: yesterday, referenceId: "linked-ref" }),
        seedTodo({ id: "value-past", text: "Value copied", sourceDate: yesterday, referenceId: "value-past-ref" }),
      ],
      [tomorrow]: [
        seedTodo({ id: "future", text: "Future only", sourceDate: tomorrow }),
        seedTodo({ id: "linked-future", text: "Linked forward", sourceDate: tomorrow, referenceId: "linked-ref" }),
        seedTodo({
          id: "value-future",
          text: "Value copied",
          sourceDate: tomorrow,
          referenceId: "value-future-ref",
          copiedFromDate: yesterday,
        }),
      ],
    },
  });

  await openBacklog(page);

  await expect(page.getByText("Visible backlog")).toBeVisible();
  await expect(page.getByText("Future only")).toHaveCount(0);
  await expect(page.getByText("Linked forward")).toHaveCount(0);
  await expect(page.getByText("Value copied")).toHaveCount(0);
});

test("groups linked backlog tasks and navigates through date links", async ({ page }) => {
  const twoDaysAgo = dateKey(-2);
  const yesterday = dateKey(-1);
  await seedState(page, {
    todosByDate: {
      [twoDaysAgo]: [
        seedTodo({ id: "group-old", text: "Grouped backlog", sourceDate: twoDaysAgo, referenceId: "group-ref" }),
      ],
      [yesterday]: [
        seedTodo({ id: "group-new", text: "Grouped backlog", sourceDate: yesterday, referenceId: "group-ref" }),
      ],
    },
  });

  await openBacklog(page);

  await expect(page.getByText("Grouped backlog")).toHaveCount(1);
  await expect(page.locator(".backlog-date-link")).toHaveCount(2);
  await page.locator(".backlog-date-link").first().click();
  await expect(page.locator(".datepicker-trigger")).not.toHaveText("Backlog");
  await expect(page.locator("textarea.task-text-input")).toHaveValue("Grouped backlog");
});

test("deletes backlog references across dates and supports canceling the confirmation", async ({ page }) => {
  const yesterday = dateKey(-1);
  const twoDaysAgo = dateKey(-2);
  await seedState(page, {
    todosByDate: {
      [twoDaysAgo]: [
        seedTodo({ id: "delete-old", text: "Delete linked backlog", sourceDate: twoDaysAgo, referenceId: "delete-ref" }),
      ],
      [yesterday]: [
        seedTodo({ id: "delete-new", text: "Delete linked backlog", sourceDate: yesterday, referenceId: "delete-ref" }),
        seedTodo({ id: "cancel-delete", text: "Cancel delete backlog", sourceDate: yesterday }),
      ],
    },
  });

  await openBacklog(page);
  page.once("dialog", async (dialog) => {
    await dialog.dismiss();
  });
  await page.locator(".backlog-task-line", { hasText: "Cancel delete backlog" }).getByLabel("Open task menu").click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(page.getByText("Cancel delete backlog")).toBeVisible();

  page.once("dialog", async (dialog) => {
    await dialog.accept();
  });
  await page.locator(".backlog-task-line", { hasText: "Delete linked backlog" }).getByLabel("Open task menu").click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(page.getByText("Delete linked backlog")).toHaveCount(0);

  const storedState = await getStoredState(page);
  expect(Object.values(storedState.todosByDate).flat().some((todo: { referenceId: string }) => todo.referenceId === "delete-ref")).toBe(false);
});

test("uses backlog thread indicator and disabled Move to state", async ({ page }) => {
  const yesterday = dateKey(-1);
  await seedState(page, {
    todosByDate: {
      [yesterday]: [
        seedTodo({ id: "threaded-backlog", text: "Threaded backlog", sourceDate: yesterday, referenceId: "threaded-ref" }),
      ],
    },
    threads: [
      seedThread({
        id: "thread-1",
        title: "Backlog thread",
        tasks: [seedThreadTask({ id: "thread-task-1", text: "Threaded backlog", referenceId: "threaded-ref" })],
      }),
    ],
  });

  await openBacklog(page);
  await page.getByLabel("Open task menu").click();
  await expect(page.getByRole("menuitem", { name: "Move to" })).toBeDisabled();
  await page.keyboard.press("Escape");

  await page.getByLabel("Show thread for Threaded backlog").click();
  await page.getByRole("menuitem", { name: "Backlog thread" }).click();
  await expect(page).toHaveURL(/\/thread\/\?threadId=thread-1/);
});

test("copies a backlog task to a selected date", async ({ page }) => {
  const yesterday = dateKey(-1);
  const tomorrow = dateKey(1);
  await seedState(page, {
    todosByDate: {
      [yesterday]: [seedTodo({ id: "copy-backlog", text: "Copy backlog", sourceDate: yesterday })],
    },
  });

  await openBacklog(page);
  await page.getByLabel("Open task menu").click();
  await page.getByRole("menuitem", { name: "Copy to" }).click();
  await activeDay(page, tomorrow).click();

  await page.locator(".datepicker-trigger").click();
  await activeDay(page, tomorrow).click();
  await expect(page.locator("textarea.task-text-input")).toHaveValue("Copy backlog");
});
