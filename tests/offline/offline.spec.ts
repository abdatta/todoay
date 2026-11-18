import { expect, test, type Page } from "@playwright/test";

const waitForServiceWorkerControl = (page: Page) =>
  page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) => {
        navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true });
      });
    }
  });

test("precaches every script and stylesheet the app shell uses", async ({ page }) => {
  await page.goto("/");
  await waitForServiceWorkerControl(page);

  const uncached = await page.evaluate(async () => {
    const urls = Array.from(
      document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>("script[src], link[rel=stylesheet][href]"),
    )
      .map((element) => ("src" in element ? element.src : element.href))
      .filter((url) => url.startsWith(window.location.origin));
    const results = await Promise.all(
      urls.map(async (url) => ((await caches.match(url, { ignoreSearch: true })) ? null : url)),
    );
    return { checked: urls.length, missing: results.filter(Boolean) };
  });

  expect(uncached.checked).toBeGreaterThan(0);
  expect(uncached.missing).toEqual([]);
});

test("opens, navigates, and saves edits with no network", async ({ page, context }) => {
  await page.goto("/");
  await waitForServiceWorkerControl(page);

  await context.setOffline(true);

  // Cold open while offline.
  await page.reload();
  await page.getByRole("button", { name: /add item/i }).click();
  const taskInput = page.locator("textarea.task-text-input").first();
  await taskInput.fill("Written offline");

  // In-app navigation while offline.
  await page.getByRole("link", { name: "Notes" }).click();
  await expect(page).toHaveURL(/\/notes\/?$/);
  await page.getByRole("link", { name: "Threads" }).click();
  await expect(page).toHaveURL(/\/threads\/?$/);

  // Direct loads of other routes while offline, including one with a query.
  await page.goto("/settings/");
  await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
  await page.goto("/thread/?id=missing");
  await expect(page.getByRole("link", { name: "Tasks" })).toBeVisible();

  // The offline edit survived all of that.
  await page.goto("/");
  await expect(page.locator("textarea.task-text-input").first()).toHaveValue("Written offline");
});
