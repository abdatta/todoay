import { expect, test } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { dateKey, seedNote, seedState, seedThread, seedTodo } from "./helpers";

const uploadJson = async (
  page: import("@playwright/test").Page,
  testInfo: { outputPath: (path: string) => string },
  filename: string,
  content: unknown,
) => {
  const importFile = testInfo.outputPath(filename);
  await writeFile(importFile, typeof content === "string" ? content : JSON.stringify(content));
  await page.locator('input[type="file"]').setInputFiles(importFile);
};

const todoayExport = (taskText: string, taskId = "imported-task") => {
  const today = dateKey();
  return {
    version: 3,
    exportedAt: "2026-06-01T00:00:00.000Z",
    tasks: {
      [today]: [
        seedTodo({
          id: taskId,
          text: taskText,
          sourceDate: today,
        }),
      ],
    },
    noteIdsByDate: {},
    noteDocs: {},
    threads: [],
  };
};

test("keeps settings local-only and persists the linked-copy preference", async ({ page }) => {
  await seedState(page);
  await page.goto("/settings");

  await expect(page.getByText("Local only - Synced at -")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(page.getByLabel("Open cloud history")).toBeDisabled();

  const copySwitch = page.getByRole("switch", { name: "Copy To keeps copies linked" });
  await expect(copySwitch).toHaveAttribute("aria-checked", "true");

  await copySwitch.click();
  await expect(copySwitch).toHaveAttribute("aria-checked", "false");

  await page.reload();
  await expect(page.getByRole("switch", { name: "Copy To keeps copies linked" })).toHaveAttribute(
    "aria-checked",
    "false",
  );
});

test("changes theme to light, dark, and system and persists the preference", async ({ page }) => {
  await seedState(page);
  await page.goto("/settings");

  await page.getByLabel("Dark mode preference").click();
  await page.getByRole("option", { name: "Light" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await page.getByLabel("Dark mode preference").click();
  await page.getByRole("option", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.getByLabel("Dark mode preference").click();
  await page.getByRole("option", { name: "System" }).click();
  await expect(page.getByLabel("Dark mode preference")).toHaveText("System");

  await page.reload();
  await expect(page.getByLabel("Dark mode preference")).toHaveText("System");
});

test("closes the theme dropdown on outside click", async ({ page }) => {
  await seedState(page);
  await page.goto("/settings");

  await page.getByLabel("Dark mode preference").click();
  await expect(page.getByRole("listbox", { name: "Dark mode options" })).toBeVisible();
  await page.getByRole("heading", { name: "Settings" }).click();
  await expect(page.getByRole("listbox", { name: "Dark mode options" })).toHaveCount(0);
});

test("exports JSON containing tasks, notes, threads, and settings", async ({ page }) => {
  const today = dateKey();
  await seedState(page, {
    todosByDate: {
      [today]: [seedTodo({ id: "task-1", text: "Exported task", sourceDate: today })],
    },
    noteIdsByDate: {
      [today]: ["note-1"],
    },
    noteDocs: {
      "note-1": seedNote({ id: "note-1", content: "Exported note" }),
    },
    threads: [seedThread({ id: "thread-1", title: "Exported thread" })],
    themeMode: "dark",
  });

  await page.goto("/settings");
  const downloadPromise = page.waitForEvent("download");
  await page.getByLabel("Export tasks, notes, and threads as JSON").click();
  const download = await downloadPromise;
  const downloadedPath = await download.path();
  expect(downloadedPath).not.toBeNull();
  const data = JSON.parse(await readFile(downloadedPath!, "utf8"));

  expect(data.version).toBe(3);
  expect(data.tasks[today][0].text).toBe("Exported task");
  expect(data.noteDocs["note-1"].content).toBe("Exported note");
  expect(data.threads[0].title).toBe("Exported thread");
  expect(data.themeMode).toBeUndefined();
  expect(data.syncMetadata).toBeDefined();
});

test("imports a Todoay JSON backup without external services", async ({ page }, testInfo) => {
  await seedState(page);
  await page.goto("/settings");
  await uploadJson(page, testInfo, "todoay-import.json", todoayExport("Imported from backup"));

  await expect(page.getByText("Imported data and merged it into your existing tasks, notes, and threads.")).toBeVisible();
  await page.getByRole("link", { name: "Tasks" }).click();
  await expect(page.locator("textarea.task-text-input")).toHaveValue("Imported from backup");
});

test("shows graceful errors for invalid import files", async ({ page }, testInfo) => {
  await seedState(page);
  await page.goto("/settings");

  await uploadJson(page, testInfo, "invalid-json.json", "{not json");
  await expect(page.locator(".settings-status.error")).toBeVisible();

  await uploadJson(page, testInfo, "invalid-shape.json", { hello: "world" });
  await expect(page.getByText("That file does not look like a Todoay export.")).toBeVisible();
});

test("opens conflict modal and keeps existing data by default", async ({ page }, testInfo) => {
  const today = dateKey();
  await seedState(page, {
    todosByDate: {
      [today]: [seedTodo({ id: "conflict-task", text: "Existing conflict", sourceDate: today })],
    },
  });

  await page.goto("/settings");
  await uploadJson(page, testInfo, "conflict-existing.json", todoayExport("Imported conflict", "conflict-task"));
  await expect(page.getByRole("dialog", { name: "Resolve Merge Conflicts" })).toBeVisible();
  await page.getByRole("button", { name: "Merge Now" }).click();

  await page.getByRole("link", { name: "Tasks" }).click();
  await expect(page.locator("textarea.task-text-input")).toHaveValue("Existing conflict");
});

test("resolves import conflict by using imported data", async ({ page }, testInfo) => {
  const today = dateKey();
  await seedState(page, {
    todosByDate: {
      [today]: [seedTodo({ id: "conflict-task", text: "Existing conflict", sourceDate: today })],
    },
  });

  await page.goto("/settings");
  await uploadJson(page, testInfo, "conflict-imported.json", todoayExport("Imported conflict", "conflict-task"));
  await page.getByRole("button", { name: "Use imported" }).click();
  await page.getByRole("button", { name: "Merge Now" }).click();

  await page.getByRole("link", { name: "Tasks" }).click();
  await expect(page.locator("textarea.task-text-input")).toHaveValue("Imported conflict");
});

test("resolves import conflict by keeping both copies", async ({ page }, testInfo) => {
  const today = dateKey();
  await seedState(page, {
    todosByDate: {
      [today]: [seedTodo({ id: "conflict-task", text: "Existing conflict", sourceDate: today })],
    },
  });

  await page.goto("/settings");
  await uploadJson(page, testInfo, "conflict-both.json", todoayExport("Imported conflict", "conflict-task"));
  await page.getByRole("button", { name: "Keep both" }).click();
  await page.getByRole("button", { name: "Merge Now" }).click();

  await page.getByRole("link", { name: "Tasks" }).click();
  await expect(page.locator("textarea.task-text-input")).toHaveCount(2);
  await expect(page.locator("textarea.task-text-input").first()).toHaveValue("Existing conflict");
  await expect(page.locator("textarea.task-text-input").last()).toHaveValue("Imported conflict");
});

test("cancels an import conflict without importing data", async ({ page }, testInfo) => {
  const today = dateKey();
  await seedState(page, {
    todosByDate: {
      [today]: [seedTodo({ id: "conflict-task", text: "Existing conflict", sourceDate: today })],
    },
  });

  await page.goto("/settings");
  await uploadJson(page, testInfo, "conflict-cancel.json", todoayExport("Imported conflict", "conflict-task"));
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("Import canceled.")).toBeVisible();

  await page.getByRole("link", { name: "Tasks" }).click();
  await expect(page.locator("textarea.task-text-input")).toHaveCount(1);
  await expect(page.locator("textarea.task-text-input")).toHaveValue("Existing conflict");
});
