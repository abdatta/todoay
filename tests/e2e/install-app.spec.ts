import { expect, test, type Page } from "@playwright/test";
import { seedState } from "./helpers";

async function dispatchInstallCapability(page: Page) {
  await page.evaluate(() => {
    const testWindow = window as Window & { __todoayPromptCalled?: boolean };
    testWindow.__todoayPromptCalled = false;

    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.defineProperties(event, {
      platforms: { value: ["web"] },
      prompt: {
        value: async () => {
          testWindow.__todoayPromptCalled = true;
        },
      },
      userChoice: { value: Promise.resolve({ outcome: "accepted", platform: "web" }) },
    });

    window.dispatchEvent(event);
  });
}

async function installButtonWidth(page: Page) {
  const box = await page.getByRole("button", { name: "Install Todoay as an app" }).boundingBox();
  expect(box).not.toBeNull();
  return box?.width ?? 0;
}

test("reveals the PWA install button after install capability is detected", async ({ page }) => {
  await seedState(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();

  const installButton = page.getByRole("button", { name: "Install Todoay as an app" });
  await expect(installButton).toHaveCount(0);

  await dispatchInstallCapability(page);
  await expect(installButton).toBeVisible();
  expect(await installButtonWidth(page)).toBeLessThan(60);

  await expect
    .poll(() => installButtonWidth(page), { timeout: 5_000 })
    .toBeGreaterThan(80);
  await expect(installButton.locator(".install-header-label")).toBeVisible();

  await expect
    .poll(() => installButtonWidth(page), { timeout: 7_000 })
    .toBeLessThan(60);

  await installButton.click();
  await expect
    .poll(() =>
      page.evaluate(() => Boolean((window as Window & { __todoayPromptCalled?: boolean }).__todoayPromptCalled)),
    )
    .toBe(true);
  await expect(installButton).toHaveCount(0);
});

test("hides the PWA install button when already running as an installed app", async ({ page }) => {
  await page.addInitScript(() => {
    const originalMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query: string) => {
      if (query.includes("display-mode: standalone")) {
        return {
          matches: true,
          media: query,
          onchange: null,
          addListener: () => undefined,
          removeListener: () => undefined,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          dispatchEvent: () => false,
        };
      }

      return originalMatchMedia(query);
    };
  });

  await seedState(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();

  await dispatchInstallCapability(page);
  await expect(page.getByRole("button", { name: "Install Todoay as an app" })).toHaveCount(0);
});
