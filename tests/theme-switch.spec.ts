import { expect, test } from "@playwright/test";

test("宋韵主题可以即时生效并在刷新后保持", async ({ page }) => {
  await page.route("**/api/model/test", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ server: { configured: true, hostedConfigured: true } }),
    });
  });
  await page.route("**/api/menus/generate", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ menus: [] }),
    });
  });

  await page.goto("/");

  const nav = page.getByRole("navigation", { name: "全局导航" });
  const summary = nav.locator('summary[aria-label="打开更多入口"]');
  await expect(async () => {
    if ((await nav.locator("details[open]").count()) === 0) {
      await summary.click();
    }
    await expect(nav.locator("details[open]")).toHaveCount(1, { timeout: 1000 });
  }).toPass({ timeout: 15_000 });

  await nav.locator("details[open]").getByRole("button", { name: "主题设置" }).click();
  await page.getByRole("button", { name: /宋韵主题/ }).click();

  await expect(page.locator("html")).toHaveAttribute("data-theme", "song");
  await expect
    .poll(() => page.locator("body").evaluate((element) => getComputedStyle(element).backgroundColor))
    .toBe("rgb(221, 220, 210)");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "song");
});
