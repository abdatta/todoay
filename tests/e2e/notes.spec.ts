import { expect, test } from "@playwright/test";
import { dateKey, dayOfMonth, seedNote, seedState } from "./helpers";

const activeDay = (page: import("@playwright/test").Page, date: string) =>
  page.locator(".datepicker-day:not(.datepicker-day-outside)", { hasText: new RegExp(`^${dayOfMonth(date)}$`) });

test("keeps focus when the first note starts with a dash", async ({ page }) => {
  await seedState(page);
  await page.goto("/notes");

  const firstDraft = page.locator("textarea.note-textarea").first();
  await firstDraft.click();
  await firstDraft.pressSequentially("-");

  const savedNote = page.locator("textarea.note-textarea").first();
  await expect(savedNote).toHaveValue("-");
  await expect(savedNote).toBeFocused();
});

test("keeps notes scoped to the selected date", async ({ page }) => {
  const yesterday = dateKey(-1);
  const today = dateKey();
  const tomorrow = dateKey(1);
  await seedState(page, {
    noteIdsByDate: {
      [yesterday]: ["yesterday-note"],
      [today]: ["today-note"],
      [tomorrow]: ["tomorrow-note"],
    },
    noteDocs: {
      "yesterday-note": seedNote({ id: "yesterday-note", content: "Yesterday note" }),
      "today-note": seedNote({ id: "today-note", content: "Today note" }),
      "tomorrow-note": seedNote({ id: "tomorrow-note", content: "Tomorrow note" }),
    },
  });

  await page.goto("/notes");
  await expect(page.locator("textarea.note-textarea")).toHaveValue("Today note");

  await page.getByLabel("Previous day").click();
  await expect(page.locator("textarea.note-textarea")).toHaveValue("Yesterday note");

  await page.getByLabel("Next day").click();
  await expect(page.locator("textarea.note-textarea")).toHaveValue("Today note");

  await page.locator(".datepicker-trigger").click();
  await activeDay(page, tomorrow).click();
  await expect(page.locator("textarea.note-textarea")).toHaveValue("Tomorrow note");
});

test("deletes notes from a date, including only one note among multiple", async ({ page }) => {
  const today = dateKey();
  await seedState(page, {
    noteIdsByDate: {
      [today]: ["note-1", "note-2"],
    },
    noteDocs: {
      "note-1": seedNote({ id: "note-1", content: "Delete only this note" }),
      "note-2": seedNote({ id: "note-2", content: "Keep this note" }),
    },
  });

  await page.goto("/notes");
  await page.locator(".note-card").first().hover();
  await page.getByLabel("Delete note").first().click({ force: true });

  await expect(page.locator("textarea.note-textarea")).toHaveCount(1);
  await expect(page.locator("textarea.note-textarea")).toHaveValue("Keep this note");
  await expect(page.getByText("Delete only this note")).toHaveCount(0);
});

test("creates multiple notes and persists them after reload", async ({ page }) => {
  await seedState(page);
  await page.goto("/notes");

  await page.locator("textarea.note-textarea").first().fill("First persisted note");
  await page.getByRole("button", { name: /add another note/i }).click();
  await page.locator("textarea.note-textarea").last().fill("Second persisted note");

  await page.reload();
  await expect(page.locator("textarea.note-textarea")).toHaveCount(2);
  await expect(page.locator("textarea.note-textarea").first()).toHaveValue("First persisted note");
  await expect(page.locator("textarea.note-textarea").last()).toHaveValue("Second persisted note");
});

test("keeps long note editing focused without jumping scroll upward", async ({ page }) => {
  await seedState(page);
  await page.goto("/notes");

  const longContent = Array.from({ length: 80 }, (_, index) => `Line ${index + 1}`).join("\n");
  const note = page.locator("textarea.note-textarea").first();
  await note.fill(longContent);
  await note.press("End");
  await page.mouse.wheel(0, 1000);
  const scrollBeforeEnter = await page.evaluate(() => window.scrollY);

  await note.press("Enter");
  await note.pressSequentially("Still typing");

  await expect(note).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThanOrEqual(scrollBeforeEnter - 20);
});

test("continues dash bullets in an existing note", async ({ page }) => {
  await seedState(page);
  await page.goto("/notes");

  const note = page.locator("textarea.note-textarea").first();
  await note.fill("- first");
  await note.press("Enter");
  await note.pressSequentially("second");

  await expect(note).toHaveValue("- first\n- second");
});

test("focuses a newly added note", async ({ page }) => {
  await seedState(page);
  await page.goto("/notes");

  await page.locator("textarea.note-textarea").first().fill("Existing note");
  await page.getByRole("button", { name: /add another note/i }).click();

  await expect(page.locator("textarea.note-textarea")).toHaveCount(2);
  await expect(page.locator("textarea.note-textarea").last()).toBeFocused();
});

test("continues star bullets in an existing note", async ({ page }) => {
  await seedState(page);
  await page.goto("/notes");

  const note = page.locator("textarea.note-textarea").first();
  await note.fill("* first");
  await note.press("Enter");
  await note.pressSequentially("second");

  await expect(note).toHaveValue("* first\n* second");
});

test("uses normal newlines in non-bullet notes", async ({ page }) => {
  await seedState(page);
  await page.goto("/notes");

  const note = page.locator("textarea.note-textarea").first();
  await note.fill("first");
  await note.press("Enter");
  await note.pressSequentially("second");

  await expect(note).toHaveValue("first\nsecond");
});

test("shows note progress indicators in the Notes date picker", async ({ page }) => {
  const today = dateKey();
  await seedState(page, {
    noteIdsByDate: {
      [today]: ["note-1"],
    },
    noteDocs: {
      "note-1": seedNote({ id: "note-1", content: "Progress note" }),
    },
  });

  await page.goto("/notes");
  await page.locator(".datepicker-trigger").click();

  await expect(activeDay(page, today)).toHaveClass(/datepicker-day-has-items/);
  await expect(activeDay(page, today).locator(".datepicker-day-progress-value")).toHaveCount(1);
});

test("persists a note after navigation away and back", async ({ page }) => {
  await seedState(page);
  await page.goto("/notes");

  await page.locator("textarea.note-textarea").first().fill("Return to this note");
  await page.getByRole("link", { name: "Tasks" }).click();
  await page.getByRole("link", { name: "Notes" }).click();

  await expect(page.locator("textarea.note-textarea")).toHaveValue("Return to this note");
});
