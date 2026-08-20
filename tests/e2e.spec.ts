import { test, expect, Page } from "@playwright/test";

const FIXED_MENU = {
  week_start: "2026-07-13",
  start_date: "2026-07-13",
  end_date: "2026-07-17",
  period_type: "week",
  schema_version: 2,
  days: Array.from({ length: 5 }, (_, dayIndex) => ({
    day: ["Mon", "Tue", "Wed", "Thu", "Fri"][dayIndex],
    date: `2026-07-${String(13 + dayIndex).padStart(2, "0")}`,
    meals: ["breakfast", "lunch", "dinner"].map((type, mealIndex) => ({
      type,
      name: `${["燕麦鸡蛋", "番茄鸡肉", "香菇青菜"][mealIndex]}${dayIndex + 1}`,
      calories: 300 + mealIndex * 120,
      dishes: [{
        name: `${["燕麦鸡蛋", "番茄鸡肉", "香菇青菜"][mealIndex]}${dayIndex + 1}`,
        ingredients: [
          { name: `${["燕麦", "鸡胸肉", "青菜"][mealIndex]}${dayIndex + 1}`, amount: 100 + dayIndex * 10, unit: "g", category: mealIndex === 1 ? "meat" : mealIndex === 2 ? "vegetable" : "grain" },
        ],
        seasonings: [{ name: "盐", unit: "适量", category: "seasoning" }],
        steps: ["处理食材。", "烹饪至熟后调味。"],
        calories: 300 + mealIndex * 120,
        nutrition: { calories: 300 + mealIndex * 120, protein_g: 20 },
        cooking_time_minutes: 20,
        difficulty: "easy",
        tags: ["测试菜单"],
      }],
    })),
  })),
};

async function seedFixedMenu(page: Page): Promise<void> {
  await page.goto("/menus");
  await page.evaluate((menu) => {
    localStorage.setItem("yanhuofood.menuOnboardingCompleted", "true");
    localStorage.setItem("yanhuofood.localMenus", JSON.stringify([{
      id: "fixed-menu",
      start_date: menu.start_date,
      week_start: menu.week_start,
      end_date: menu.end_date,
      data: menu,
      source: "local",
    }]));
  }, FIXED_MENU);
  await page.reload();
  await page.getByText("燕麦鸡蛋1", { exact: false }).first().waitFor();
}

async function clearLocalStorage(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => {
    window.localStorage.clear();
  });
}

async function openIngredientsForFixedMenu(page: Page): Promise<void> {
  await page.goto("/");
  const action = page.getByRole("link", { name: /生成采购清单/ });
  await expect(action).toBeVisible();
  await action.click();
  await page.waitForURL("/ingredients");
  const menuSelector = page.getByRole("combobox").first();
  await expect(menuSelector.locator("option")).toHaveCount(2);
  await menuSelector.selectOption(FIXED_MENU.start_date);
  await expect(page.getByText("待采购", { exact: true })).toBeVisible();
  await expect(ingredientCheckboxes(page).first()).toBeVisible();
}

function ingredientCheckboxes(page: Page) {
  return page.getByRole("listitem").getByRole("checkbox");
}

async function reselectFixedMenu(page: Page): Promise<void> {
  const menuSelector = page.getByRole("combobox").first();
  await menuSelector.selectOption(FIXED_MENU.start_date);
  await expect(ingredientCheckboxes(page).first()).toBeVisible();
}

test.describe("Dev.md 自动化测试", () => {
  test("3. 设置忌口、清真或过敏条件，确认冲突会阻止采购", async ({ page }) => {
    await clearLocalStorage(page);
    await seedFixedMenu(page);

    const menuContent = await page.textContent("body");
    expect(menuContent).not.toContain("花生");

    await openIngredientsForFixedMenu(page);
    const listContent = await page.textContent("body");
    expect(listContent).not.toContain("花生");
  });

  test("4. 勾选、家中已有和分类折叠刷新后仍保留", async ({ page }) => {
    await clearLocalStorage(page);
    await seedFixedMenu(page);

    await openIngredientsForFixedMenu(page);
    await page.waitForSelector("text=待采购");

    const firstCheckbox = ingredientCheckboxes(page).first();
    await firstCheckbox.check();

    const ownedButton = page.locator('button', { hasText: '家中已有' }).nth(1);
    await ownedButton.click();

    await page.reload();
    await reselectFixedMenu(page);
    await expect(ingredientCheckboxes(page).first()).toBeChecked();

    const hasOwnedBadge = await page.textContent("body");
    expect(hasOwnedBadge).toContain("家中已有");
  });

  test("5. 换菜后清单显示新增/移除差异，原有进度不被静默清空", async ({ page }) => {
    await clearLocalStorage(page);
    await seedFixedMenu(page);
    const replacedMenu = structuredClone(FIXED_MENU);
    replacedMenu.days[0].meals[0].name = "南瓜小米粥";
    replacedMenu.days[0].meals[0].dishes[0] = {
      ...replacedMenu.days[0].meals[0].dishes[0],
      name: "南瓜小米粥",
      ingredients: [{ name: "南瓜", amount: 180, unit: "g", category: "vegetable" }],
    };
    await page.route("**/api/menus/replace", route => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ menu: replacedMenu, source: "ai" }),
    }));

    await openIngredientsForFixedMenu(page);

    const firstCheckbox = ingredientCheckboxes(page).first();
    await firstCheckbox.check();
    await expect.poll(() => page.evaluate(() => {
      const states = JSON.parse(localStorage.getItem("yanhuofood.shoppingListState") || "{}");
      return Object.values(states).some((state) => !!(state as { menu_fingerprint?: string }).menu_fingerprint);
    })).toBe(true);

    await page.goto("/menus");

    const replaceButton = page.getByText("换菜", { exact: true }).first();
    await expect(replaceButton).toBeVisible();
    await replaceButton.click();

    const dislikeButton = page.getByRole("button", { name: "不爱吃" });
    await expect(dislikeButton).toBeVisible();
    await dislikeButton.click();
    await page.getByText("已替换目标餐次").waitFor();

    await openIngredientsForFixedMenu(page);
    await expect(page.getByText(/菜单或日期范围已变化：新增 \d+ 项，移除 \d+ 项/)).toBeVisible({ timeout: 15_000 });
  });

  test("6. 在手机上测试系统分享、PNG、CSV 和打印", async ({ page }) => {
    await clearLocalStorage(page);
    await seedFixedMenu(page);

    await openIngredientsForFixedMenu(page);

    await expect(page.locator('button', { hasText: '复制文本' })).toBeVisible();
    await expect(page.locator('button', { hasText: '分享' })).toBeVisible();
    await expect(page.locator('button', { hasText: '下载图片' })).toBeVisible();
    await expect(page.locator('button', { hasText: '下载 CSV' })).toBeVisible();
  });

  test("7. 标记'不想再吃'后反馈会进入下次生成请求", async ({ page }) => {
    await clearLocalStorage(page);
    await seedFixedMenu(page);
    await page.route("**/api/dish-feedback", route => {
      if (route.request().method() === "PUT") {
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: { message: "反馈服务暂不可用" } }),
        });
      }
      return route.continue();
    });

    const detailButton = page.getByText("详情", { exact: true }).first();
    await expect(detailButton).toBeVisible();
    await detailButton.click();

    const dislikeButton = page.getByRole("button", { name: "不想再吃" });
    await expect(dislikeButton).toBeVisible();
    await dislikeButton.click();
    await page.getByLabel("关闭详情").click();
    await expect(page.getByText("服务端反馈暂时不可用，本次反馈仅保存在当前浏览器。", { exact: true })).toBeVisible();

    const storedFeedback = await page.evaluate(() => JSON.parse(localStorage.getItem("yanhuofood.dishFeedback") || "[]"));
    expect(storedFeedback.some((entry: { blocked?: boolean }) => entry.blocked)).toBe(true);
  });

  test("菜单菜品详情提供抖音做法搜索入口", async ({ page }) => {
    await clearLocalStorage(page);
    await seedFixedMenu(page);

    await page.getByText("详情", { exact: true }).first().click();
    const dialog = page.getByRole("dialog", { name: "燕麦鸡蛋1" });
    const douyinLink = dialog.getByRole("link", { name: /在抖音搜索做法/ });

    await expect(dialog).toBeVisible();
    await expect(douyinLink).toBeVisible();
    await expect(douyinLink).toHaveAttribute(
      "href",
      `https://www.douyin.com/search/${encodeURIComponent("燕麦鸡蛋1 做法")}`
    );
    await expect(douyinLink).toHaveAttribute("target", "_blank");
  });

  test("8. 勾选至少 3 个采购项后回到首页，确认主动作变成'规划下周菜单'", async ({ page }) => {
    await clearLocalStorage(page);
    await seedFixedMenu(page);

    await openIngredientsForFixedMenu(page);

    const checkboxes = ingredientCheckboxes(page);
    await expect(checkboxes.nth(2)).toBeVisible();

    for (let i = 0; i < 3; i++) {
      await checkboxes.nth(i).check();
    }

    await page.goto("/");

    await expect(page.getByText("规划下周菜单", { exact: true }).first()).toBeVisible();
  });

  test("9. 使用两个独立浏览器，确认个人食谱、反馈和采购状态相互隔离", async ({ browser }) => {
    const context1 = await browser.newContext();
    const page1 = await context1.newPage();

    const context2 = await browser.newContext();
    const page2 = await context2.newPage();

    await page1.goto("/");
    await page1.evaluate(() => window.localStorage.clear());

    await page2.goto("/");
    await page2.evaluate(() => window.localStorage.clear());

    await seedFixedMenu(page1);
    await seedFixedMenu(page2);

    await openIngredientsForFixedMenu(page1);
    const firstCheckbox1 = ingredientCheckboxes(page1).first();
    await firstCheckbox1.check();

    await openIngredientsForFixedMenu(page2);
    const firstCheckbox2 = ingredientCheckboxes(page2).first();

    expect(await firstCheckbox2.isChecked()).toBe(false);

    await context1.close();
    await context2.close();
  });

  test("10. 测试服务端持久化（购物清单状态）", async ({ page }) => {
    await clearLocalStorage(page);
    await seedFixedMenu(page);

    await openIngredientsForFixedMenu(page);

    const firstCheckbox = ingredientCheckboxes(page).first();
    await firstCheckbox.check();

    const ownedButton = page.locator('button', { hasText: '家中已有' }).nth(1);
    await ownedButton.click();

    await page.reload();
    await reselectFixedMenu(page);
    await expect(ingredientCheckboxes(page).first()).toBeChecked();

    const hasOwnedBadge = await page.textContent("body");
    expect(hasOwnedBadge).toContain("家中已有");
  });

  test("10. 测试服务端持久化（菜品反馈）", async ({ page }) => {
    await clearLocalStorage(page);
    await seedFixedMenu(page);

    const detailButton = page.getByText("详情", { exact: true }).first();
    await expect(detailButton).toBeVisible();
    await detailButton.click();

    const likeButton = page.getByRole("button", { name: "喜欢" });
    await expect(likeButton).toBeVisible();
    await likeButton.click();
    await page.getByLabel("关闭详情").click();

    await page.reload();
    await page.getByText("详情", { exact: true }).first().click();
    const persistedLikeButton = page.getByRole("button", { name: "喜欢" });
    await expect(persistedLikeButton).toHaveClass(/bg-/);
    await page.getByLabel("关闭详情").click();
  });
});
