import { expect, test } from "@playwright/test";
import {
  addMonths,
  dateKey,
  dayOfMonth,
  monthLabel,
  seedState,
  seedTodo,
} from "./helpers";

const openDatePicker = async (page: import("@playwright/test").Page) => {
  await page.locator(".datepicker-trigger").click();
  await expect(page.locator(".datepicker-popup")).toBeVisible();
};

const activeDay = (page: import("@playwright/test").Page, date: string) =>
  page.locator(".datepicker-day:not(.datepicker-day-outside)", { hasText: new RegExp(`^${dayOfMonth(date)}$`) });

const pickActiveDay = async (page: import("@playwright/test").Page, date: string) => {
  await activeDay(page, date).click();
};

const taskInputByValue = (page: import("@playwright/test").Page, value: string) =>
  page.locator("textarea.task-text-input").filter({ hasText: value });

test("creates, completes, and persists a dated task", async ({ page }) => {
  await seedState(page);
  await page.goto("/");

  await page.getByRole("button", { name: /add item/i }).click();
  const taskInput = page.locator("textarea.task-text-input").first();
  await expect(taskInput).toBeFocused();
  await taskInput.fill("Write regression tests");
  await page.getByLabel("Estimated task duration in minutes").fill("25");
  await page.locator("input.todo-checkbox").check();

  await expect(page.getByText("1 Completed item")).toBeVisible();
  await expect(page.locator("textarea.task-text-input.completed")).toHaveValue("Write regression tests");

  await page.reload();
  await expect(page.locator("textarea.task-text-input.completed")).toHaveValue("Write regression tests");
  await expect(page.getByLabel("Estimated task duration in minutes")).toHaveValue("25");
});

test("navigates task dates with previous, next, and date picker selection", async ({ page }) => {
  const yesterday = dateKey(-1);
  const today = dateKey();
  const tomorrow = dateKey(1);
  await seedState(page, {
    todosByDate: {
      [yesterday]: [seedTodo({ id: "yesterday-task", text: "Yesterday task", sourceDate: yesterday })],
      [today]: [seedTodo({ id: "today-task", text: "Today task", sourceDate: today })],
      [tomorrow]: [seedTodo({ id: "tomorrow-task", text: "Tomorrow task", sourceDate: tomorrow })],
    },
  });

  await page.goto("/");
  await expect(page.locator("textarea.task-text-input")).toHaveValue("Today task");

  await page.getByLabel("Previous day").click();
  await expect(page.locator("textarea.task-text-input")).toHaveValue("Yesterday task");

  await page.getByLabel("Next day").click();
  await expect(page.locator("textarea.task-text-input")).toHaveValue("Today task");

  await openDatePicker(page);
  await pickActiveDay(page, tomorrow);
  await expect(page.locator(".datepicker-trigger")).toHaveText("Tomorrow");
  await expect(page.locator("textarea.task-text-input")).toHaveValue("Tomorrow task");
});

test("supports task keyboard creation, empty checkbox disabling, and backspace deletion", async ({ page }) => {
  await seedState(page);
  await page.goto("/");

  await page.getByRole("button", { name: /add item/i }).click();
  const firstTask = page.locator("textarea.task-text-input").first();
  await expect(firstTask).toBeFocused();
  await expect(page.locator("input.todo-checkbox").first()).toBeDisabled();

  await firstTask.fill("First task");
  await firstTask.press("Enter");
  await expect(page.locator("textarea.task-text-input")).toHaveCount(2);
  await expect(page.locator("textarea.task-text-input").last()).toBeFocused();

  await page.locator("textarea.task-text-input").last().press("Backspace");
  await expect(page.locator("textarea.task-text-input")).toHaveCount(1);
  await expect(page.locator("textarea.task-text-input").first()).toBeFocused();
});

test("deletes a task from the task action menu and closes the menu on outside click", async ({ page }) => {
  const today = dateKey();
  await seedState(page, {
    todosByDate: {
      [today]: [
        seedTodo({ id: "task-1", text: "Delete me", sourceDate: today }),
        seedTodo({ id: "task-2", text: "Keep me", sourceDate: today, sortOrder: 2048 }),
      ],
    },
  });

  await page.goto("/");
  await page.getByLabel("Open task menu or long-press to reorder").first().click();
  await expect(page.getByRole("menu", { name: "Task actions" })).toBeVisible();

  await page.getByRole("heading", { name: "Tasks" }).click();
  await expect(page.getByRole("menu", { name: "Task actions" })).toHaveCount(0);

  await page.getByLabel("Open task menu or long-press to reorder").first().click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(page.locator("textarea.task-text-input")).toHaveValue("Keep me");
  await expect(page.locator("textarea.task-text-input")).toHaveCount(1);
});

test("copies and moves tasks to selected dates", async ({ page }) => {
  const today = dateKey();
  const tomorrow = dateKey(1);
  await seedState(page, {
    todosByDate: {
      [today]: [
        seedTodo({ id: "copy-task", text: "Copy this task", sourceDate: today }),
        seedTodo({ id: "move-task", text: "Move this task", sourceDate: today, sortOrder: 2048 }),
      ],
    },
  });

  await page.goto("/");
  await page.getByLabel("Open task menu or long-press to reorder").first().click();
  await page.getByRole("menuitem", { name: "Copy to" }).click();
  await pickActiveDay(page, tomorrow);

  await expect(page.locator("textarea.task-text-input").first()).toHaveValue("Copy this task");
  await openDatePicker(page);
  await pickActiveDay(page, tomorrow);
  await expect(page.locator("textarea.task-text-input")).toHaveValue("Copy this task");

  await openDatePicker(page);
  await pickActiveDay(page, today);
  await page.getByLabel("Open task menu or long-press to reorder").nth(1).click();
  await page.getByRole("menuitem", { name: "Move to" }).click();
  await pickActiveDay(page, tomorrow);

  await expect(page.locator("textarea.task-text-input")).toHaveValue("Copy this task");
  await openDatePicker(page);
  await pickActiveDay(page, tomorrow);
  await expect(page.locator("textarea.task-text-input")).toHaveCount(2);
  await expect(taskInputByValue(page, "Move this task")).toHaveCount(1);
});

test("respects linked and independent copy completion behavior", async ({ page }) => {
  const today = dateKey();
  const tomorrow = dateKey(1);
  await seedState(page, {
    todosByDate: {
      [today]: [
        seedTodo({ id: "linked-today", text: "Linked source", sourceDate: today, referenceId: "linked-ref" }),
        seedTodo({ id: "independent-today", text: "Independent source", sourceDate: today, referenceId: "independent-today-ref", sortOrder: 2048 }),
      ],
      [tomorrow]: [
        seedTodo({ id: "linked-tomorrow", text: "Linked source", sourceDate: tomorrow, referenceId: "linked-ref" }),
        seedTodo({ id: "independent-tomorrow", text: "Independent source", sourceDate: tomorrow, referenceId: "independent-tomorrow-ref", sortOrder: 2048 }),
      ],
    },
  });

  await page.goto("/");
  await openDatePicker(page);
  await pickActiveDay(page, tomorrow);
  await page.locator("input.todo-checkbox").first().check();

  await openDatePicker(page);
  await pickActiveDay(page, today);
  await expect(page.getByText("1 Completed item")).toBeVisible();
  await expect(page.locator("textarea.task-text-input.completed")).toHaveValue("Linked source");

  await openDatePicker(page);
  await pickActiveDay(page, tomorrow);
  await page.locator("input.todo-checkbox").last().check();

  await openDatePicker(page);
  await pickActiveDay(page, today);
  await expect(page.locator("textarea.task-text-input").first()).toHaveValue("Independent source");
  await expect(page.locator("input.todo-checkbox").first()).not.toBeChecked();
});

test("clears task duration and persists the empty duration", async ({ page }) => {
  const today = dateKey();
  await seedState(page, {
    todosByDate: {
      [today]: [seedTodo({ id: "duration-task", text: "Duration task", sourceDate: today, durationMinutes: 45 })],
    },
  });

  await page.goto("/");
  const durationInput = page.getByLabel("Estimated task duration in minutes");
  await expect(durationInput).toHaveValue("45");
  await durationInput.fill("");
  await page.reload();
  await expect(page.getByLabel("Estimated task duration in minutes")).toHaveValue("");
});

test("reorders tasks by long press drag and persists order", async ({ page }) => {
  const today = dateKey();
  await seedState(page, {
    todosByDate: {
      [today]: [
        seedTodo({ id: "task-1", text: "First order", sourceDate: today, sortOrder: 1024 }),
        seedTodo({ id: "task-2", text: "Second order", sourceDate: today, sortOrder: 2048 }),
      ],
    },
  });

  await page.goto("/");
  const firstHandle = page.getByLabel("Open task menu or long-press to reorder").first();
  const secondHandle = page.getByLabel("Open task menu or long-press to reorder").nth(1);
  const firstBox = await firstHandle.boundingBox();
  const secondBox = await secondHandle.boundingBox();
  expect(firstBox).not.toBeNull();
  expect(secondBox).not.toBeNull();

  await page.mouse.move(firstBox!.x + firstBox!.width / 2, firstBox!.y + firstBox!.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(650);
  await page.mouse.move(secondBox!.x + secondBox!.width / 2, secondBox!.y + secondBox!.height + 18, { steps: 8 });
  await page.mouse.up();

  await expect(page.locator("textarea.task-text-input").first()).toHaveValue("Second order");
  await page.reload();
  await expect(page.locator("textarea.task-text-input").first()).toHaveValue("Second order");
});

test("shows task progress indicators in the date picker across months", async ({ page }) => {
  const today = dateKey();
  const tomorrow = dateKey(1);
  const nextMonth = addMonths(today, 1);
  await seedState(page, {
    todosByDate: {
      [today]: [
        seedTodo({ id: "open-progress", text: "Open progress", sourceDate: today }),
        seedTodo({ id: "done-progress", text: "Done progress", sourceDate: today, completed: true }),
      ],
      [tomorrow]: [seedTodo({ id: "complete-progress", text: "Complete progress", sourceDate: tomorrow, completed: true })],
      [nextMonth]: [seedTodo({ id: "next-month-progress", text: "Next month progress", sourceDate: nextMonth })],
    },
  });

  await page.goto("/");
  await openDatePicker(page);

  await expect(activeDay(page, today)).toHaveClass(/datepicker-day-has-items/);
  await expect(activeDay(page, today).locator(".datepicker-day-progress path")).toHaveCount(1);
  await expect(activeDay(page, tomorrow).locator(".datepicker-day-progress circle.datepicker-day-progress-value")).toHaveCount(1);

  await page.getByLabel("Next month").click();
  await expect(page.locator(".datepicker-month-year")).toHaveText(monthLabel(nextMonth));
  await expect(activeDay(page, nextMonth)).toHaveClass(/datepicker-day-has-items/);
});

test("handles common Tasks date picker actions and month gestures", async ({ page }) => {
  const today = dateKey();
  const yesterday = dateKey(-1);
  const nextMonth = addMonths(today, 1);
  await seedState(page, {
    todosByDate: {
      [today]: [seedTodo({ id: "today-task", text: "Today picker task", sourceDate: today })],
      [yesterday]: [seedTodo({ id: "yesterday-task", text: "Yesterday picker task", sourceDate: yesterday })],
    },
  });

  await page.goto(`/?date=${yesterday}`);
  await openDatePicker(page);
  await expect(page.locator(".datepicker-month-year")).toHaveText(monthLabel(yesterday));

  await page.getByRole("button", { name: "Today" }).click();
  await expect(page.locator(".datepicker-trigger")).toHaveText("Today");

  await openDatePicker(page);
  await page.getByRole("button", { name: "Backlog" }).click();
  await expect(page.locator(".datepicker-trigger")).toHaveText("Backlog");

  await openDatePicker(page);
  await page.getByLabel("Next month").click();
  await expect(page.locator(".datepicker-month-year")).toHaveText(monthLabel(nextMonth));
  await expect(page.locator(".datepicker-trigger")).toHaveText("Backlog");

  const gestureArea = page.locator(".datepicker-calendar-gesture-area");
  await gestureArea.hover();
  await page.mouse.wheel(0, 800);
  await expect(page.locator(".datepicker-month-year")).toHaveText(monthLabel(addMonths(nextMonth, 1)));

  const beforeDragSelected = await page.locator(".datepicker-trigger").innerText();
  const beforeDragMonth = await page.locator(".datepicker-month-year").innerText();
  const box = await gestureArea.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + 10);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height - 8, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator(".datepicker-month-year")).not.toHaveText(beforeDragMonth);
  await expect(page.locator(".datepicker-trigger")).toHaveText(beforeDragSelected);

  await page.locator(".datepicker-day-outside").first().click();
  await expect(page.locator(".datepicker-trigger")).toHaveText(beforeDragSelected);

  await page.getByRole("heading", { name: "Tasks" }).click();
  await expect(page.locator(".datepicker-popup")).toHaveCount(0);
});

test("keeps a completed backlog task visible until leaving backlog", async ({ page }) => {
  const yesterday = dateKey(-1);
  await seedState(page, {
    todosByDate: {
      [yesterday]: [
        seedTodo({
          id: "past-task",
          text: "Carry this forward",
          sourceDate: yesterday,
        }),
      ],
    },
  });

  await page.goto("/");
  await page.locator(".datepicker-trigger").click();
  await page.getByRole("button", { name: "Backlog" }).click();

  const backlogItem = page.getByText("Carry this forward");
  await expect(backlogItem).toBeVisible();
  await page.getByLabel("Mark complete: Carry this forward").check();
  await expect(page.locator(".backlog-task-text.completed", { hasText: "Carry this forward" })).toBeVisible();

  await page.getByRole("button", { name: "Yesterday" }).click();
  await page.locator(".datepicker-trigger").click();
  await page.getByRole("button", { name: "Backlog" }).click();

  await expect(page.getByText("Carry this forward")).toHaveCount(0);
  await expect(page.getByText("No backlog tasks.")).toBeVisible();
});
