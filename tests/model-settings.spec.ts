import { test, expect } from "@playwright/test";

test.describe("模型设置授权状态", () => {
  test("授权完成后可以立即重新检查并切换到线上模型", async ({ page }) => {
    let authorized = false;

    await page.addInitScript(() => {
      window.localStorage.removeItem("yanhuofood.localModelConfig");
    });
    await page.route("**/api/model/test", async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          server: {
            configured: authorized,
            hostedConfigured: true,
            access: {
              allowed: authorized,
              reason: authorized ? "authenticated" : "wechat_follow_required",
            },
            model: "gpt-4o-mini",
            baseUrlConfigured: false,
            provider: "openai",
          },
        }),
      });
    });

    await page.goto("/model-settings");
    await expect(page.getByText("公众号尚未绑定到当前账户")).toBeVisible();

    authorized = true;
    await page.getByRole("button", { name: "重新检查授权" }).click();

    await expect(page.getByText("服务器环境变量正在生效")).toBeVisible();
  });
});

test.describe("全局导航", () => {
  test("更多菜单提供问题反馈入口", async ({ page }) => {
    await page.goto("/guide");
    // 顶部导航同时渲染桌面和移动两个“更多”菜单，按视口只点可见的那个。
    // 点击可能发生在水合完成前，details 的 open 状态会被重渲染抹掉，重试到菜单真正保持展开。
    const nav = page.locator("nav").first();
    const summary = nav.locator("summary").locator("visible=true").first();
    await expect(async () => {
      if ((await nav.locator("details[open]").count()) === 0) {
        await summary.click();
      }
      await expect(nav.locator("details[open]")).toHaveCount(1, { timeout: 1000 });
    }).toPass({ timeout: 15_000 });

    const menu = nav.locator("details[open]");
    const feedbackLink = menu.locator('a[href="https://github.com/you-want/yanhuofood/issues"]');
    await expect(feedbackLink).toHaveAttribute("target", "_blank");
    await expect(menu.getByRole("separator")).toHaveCount(1);
    await expect(menu.locator("a").nth(2)).toHaveAttribute("href", "https://github.com/you-want/yanhuofood/issues");
    await expect(menu.locator("a").nth(3)).toHaveAttribute("href", "/account");
  });
});
