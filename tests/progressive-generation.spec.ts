import { expect, test } from "@playwright/test";
import { writeProductEvent } from "@/lib/analytics/product-events";
import { isMenuGenerationJobStale } from "@/lib/ai/menu-generation-job-lifecycle";
import { isRetryableMenuRequestError } from "@/lib/ai/menu-retry";
import { findMenuConstraintIssues } from "@/lib/domain/menu-constraints";
import { resolveMenuGenerationPreferences } from "@/lib/domain/menu-generation-request";
import { generateMenuRequestSchema } from "@/lib/schemas/menu";
import { isSupabaseConnectionError } from "@/lib/supabase";
import type { Menu } from "@/lib/types";

const outlineMenu = {
  week_start: "2026-07-13",
  start_date: "2026-07-13",
  end_date: "2026-07-13",
  period_type: "day",
  schema_version: 2,
  days: [{
    date: "2026-07-13",
    day: "Mon",
    meals: [
      { type: "breakfast", name: "燕麦鸡蛋杯", calories: 320, dishes: [] },
      { type: "lunch", name: "番茄鸡肉饭", calories: 560, dishes: [] },
      { type: "dinner", name: "菌菇豆腐汤", calories: 380, dishes: [] },
    ],
  }],
};

const completedMenu = {
  ...outlineMenu,
  days: outlineMenu.days.map((day) => ({
    ...day,
    meals: day.meals.map((meal) => ({
      ...meal,
      dishes: [{
        name: meal.name,
        ingredients: [{ name: "测试食材", amount: 100, unit: "g", category: "other" }],
        seasonings: [{ name: "盐", unit: "适量", category: "seasoning" }],
        steps: ["处理食材。", "烹饪至熟。"],
        calories: meal.calories,
        cooking_time_minutes: 20,
        difficulty: "easy",
        tags: ["测试"],
      }],
    })),
  })),
};

test("模型请求只重试超时、限流、服务端和网络错误", () => {
  expect(isRetryableMenuRequestError({ status: 408 })).toBe(true);
  expect(isRetryableMenuRequestError({ status: 429 })).toBe(true);
  expect(isRetryableMenuRequestError({ status: 503 })).toBe(true);
  expect(isRetryableMenuRequestError(Object.assign(new Error("fetch failed"), { code: "ECONNRESET" }))).toBe(true);
  expect(isRetryableMenuRequestError(Object.assign(new Error("unauthorized"), { status: 401 }))).toBe(false);
  expect(isRetryableMenuRequestError(Object.assign(new Error("bad request"), { status: 400 }))).toBe(false);
  expect(isRetryableMenuRequestError(new Error("invalid model name"))).toBe(false);
});

test("Supabase 仅在网络不可达时进入本地降级", () => {
  expect(isSupabaseConnectionError({ message: "TypeError: fetch failed" })).toBe(true);
  expect(isSupabaseConnectionError(new Error("connect ECONNREFUSED 127.0.0.1:54321"))).toBe(true);
  expect(isSupabaseConnectionError({ message: "column parameter_snapshot does not exist", code: "42703" })).toBe(false);
});

test("服务端埋点写入不会长期阻塞核心流程", async () => {
  const stalledSupabase = {
    from: () => ({ insert: () => new Promise(() => {}) }),
  } as unknown as NonNullable<Parameters<typeof writeProductEvent>[0]>;
  const startedAt = Date.now();

  await writeProductEvent(stalledSupabase, {
    clientId: "test-client",
    eventName: "generation_started",
    properties: { days: 7 },
  });

  expect(Date.now() - startedAt).toBeLessThan(1_000);
});

test("参数解析遵循本次请求、已保存偏好、默认值的优先级", () => {
  const request = generateMenuRequestSchema.parse({
    cuisines: "  川菜  ",
    disliked_ingredients: ["花生", "香菜", "花生"],
    dietary_restrictions: [],
  });
  const resolved = resolveMenuGenerationPreferences({
    cuisines: "粤菜",
    dietary_restrictions: ["少盐"],
    disliked_ingredients: ["芹菜"],
    halal: true,
    light_meal: false,
    special_group: null,
    energy_display: "auto",
    days: 5,
    meal_count: 4,
    diners_count: 3,
    dishes_per_meal: 2,
    health_goal: "balanced",
    budget_level: "medium",
    cooking_time_limit: 30,
    scenario: "festival",
    festival_type: "spring_festival",
  }, request);

  expect(resolved).toMatchObject({
    cuisines: "川菜",
    dietary_restrictions: [],
    disliked_ingredients: ["花生", "香菜"],
    days: 5,
    meal_count: 4,
    diners_count: 3,
    scenario: "festival",
    festival_type: "spring_festival",
  });
});

test("硬约束检查能识别清真、忌口、少盐和控糖冲突", () => {
  const menu = structuredClone(completedMenu) as Menu;
  const dish = menu.days[0].meals[0].dishes?.[0];
  if (!dish) throw new Error("测试菜单缺少菜品");
  dish.name = "糖醋花生火腿";
  dish.ingredients = [
    { name: "花生", amount: 30, unit: "g", category: "other" },
    { name: "火腿", amount: 50, unit: "g", category: "meat" },
  ];
  dish.seasonings = [{ name: "料酒", unit: "适量", category: "seasoning" }];

  const issues = findMenuConstraintIssues(menu, {
    halal: true,
    disliked_ingredients: ["花生"],
    dietary_restrictions: ["少盐", "控糖"],
  });

  expect(issues.some((issue) => issue.type === "halal" && issue.keyword === "火腿")).toBe(true);
  expect(issues.some((issue) => issue.type === "halal" && issue.keyword === "料酒")).toBe(true);
  expect(issues.some((issue) => issue.type === "disliked_ingredient" && issue.keyword === "花生")).toBe(true);
  expect(issues.some((issue) => issue.type === "dietary_restriction" && issue.keyword === "火腿")).toBe(true);
  expect(issues.some((issue) => issue.type === "dietary_restriction" && issue.keyword === "糖醋")).toBe(true);
});

test("运行中任务超过心跳阈值会判定为陈旧，完成任务不会", () => {
  const now = Date.parse("2026-07-18T12:00:00.000Z");
  expect(isMenuGenerationJobStale({
    status: "running",
    heartbeat_at: "2026-07-18T11:49:59.000Z",
  }, now, 10 * 60 * 1000)).toBe(true);
  expect(isMenuGenerationJobStale({
    status: "running",
    heartbeat_at: "2026-07-18T11:55:00.000Z",
  }, now, 10 * 60 * 1000)).toBe(false);
  expect(isMenuGenerationJobStale({
    status: "succeeded",
    heartbeat_at: "2026-07-18T10:00:00.000Z",
  }, now, 10 * 60 * 1000)).toBe(false);
});

test("菜单生成会先展示提纲，再按天补齐详情", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.localStorage.setItem("yanhuofood.menuOnboardingCompleted", "true");
  });

  await page.route("**/api/preferences", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ preferences: { days: 1, meal_count: 3, diners_count: 1, dishes_per_meal: 1 } }),
  }));
  await page.route("**/api/dish-feedback", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ feedback: [] }),
  }));
  await page.route("**/api/menus/generate", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ menus: [] }),
  }));
  await page.route("**/api/menus/generate-jobs", (route) => route.fulfill({
    status: 202,
    contentType: "application/json",
    body: JSON.stringify({ job_id: "progressive-job", status: "queued" }),
  }));

  let pollCount = 0;
  await page.route("**/api/menus/generate-jobs/progressive-job", (route) => {
    pollCount += 1;
    if (pollCount === 1) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "running",
          stage: "generating_days",
          completed_days: 0,
          total_days: 1,
          current_day: 0,
          failed_days: [],
          partial_result: { menu: outlineMenu, source: "ai", warnings: [] },
        }),
      });
    }
    if (pollCount === 2) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "running",
          stage: "finalizing",
          completed_days: 1,
          total_days: 1,
          current_day: null,
          failed_days: [],
          partial_result: { menu: completedMenu, source: "ai", warnings: [] },
        }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "succeeded",
        result: { menu: completedMenu, source: "ai", warnings: [] },
      }),
    });
  });

  await page.goto("/menus");
  await page.locator("#menu-generate-action").first().click();

  await expect(page.getByText("燕麦鸡蛋杯", { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("正在补充详情", { exact: true }).first()).toBeVisible();
  if (process.env.CAPTURE_PROGRESSIVE_SCREENSHOT) {
    await page.screenshot({ path: `/tmp/yanhuofood-progressive-${testInfo.project.name}.png`, fullPage: true });
  }
  await expect(page.getByText("菜单已生成。", { exact: true })).toBeVisible({ timeout: 10_000 });
  await page.getByText("详情", { exact: true }).first().click();
  await expect(page.getByText("测试食材", { exact: false })).toBeVisible();
});

test("异步任务数据库不可用时会降级为直接生成", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.localStorage.setItem("yanhuofood.menuOnboardingCompleted", "true");
  });

  await page.route("**/api/preferences", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ preferences: { days: 1, meal_count: 3, diners_count: 1, dishes_per_meal: 1 } }),
  }));
  await page.route("**/api/dish-feedback", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ feedback: [] }),
  }));
  await page.route("**/api/menus/generate-jobs", (route) => route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({ error: { code: "JOB_CREATE_FAILED", message: "TypeError: fetch failed" } }),
  }));
  await page.route("**/api/menus/generate", (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ menu: completedMenu, source: "ai", warnings: [] }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ menus: [] }),
    });
  });

  await page.goto("/menus");
  await page.locator("#menu-generate-action").first().click();

  await expect(page.getByText("燕麦鸡蛋杯", { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("异步任务服务暂不可用，已改用直接生成。", { exact: true })).toBeVisible();
  await expect(page.getByText("生成失败：", { exact: false })).not.toBeVisible();
});

test("菜单页会准确传递规范化后的用户参数", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.localStorage.setItem("yanhuofood.menuOnboardingCompleted", "true");
  });
  await page.route("**/api/preferences", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ preferences: {} }) }));
  await page.route("**/api/dish-feedback", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ feedback: [] }) }));
  await page.route("**/api/menus/generate", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ menus: [] }) }));

  let requestPayload: Record<string, unknown> | null = null;
  await page.route("**/api/menus/generate-jobs", async route => {
    requestPayload = JSON.parse(route.request().postData() || "{}");
    await route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ job_id: "parameter-job", status: "queued" }) });
  });
  await page.route("**/api/menus/generate-jobs/parameter-job", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ status: "cancelled", error: "test finished" }),
  }));

  await page.goto("/menus");
  // 展开点击可能发生在水合完成前被吞掉，重试到高级字段真正出现。
  // 注意哨兵必须用只在高级区存在的字段（#menu-diners-count 在基础区也有）。
  await expect(async () => {
    if (!(await page.locator("#menu-dishes-per-meal").isVisible())) {
      await page.getByRole("button", { name: /高级条件/ }).click();
    }
    await expect(page.locator("#menu-dishes-per-meal")).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await page.locator("#menu-diners-count").fill("4");
  await page.locator("#menu-dishes-per-meal").fill("2");
  await page.locator("#menu-cooking-time-limit").fill("35");
  await page.locator("#menu-cuisines").fill(" 川菜、粤菜 ");
  await page.locator("#menu-disliked-ingredients-advanced").fill("花生, 香菜, 花生");
  await page.locator("#menu-generate-action").first().click();

  await expect.poll(() => requestPayload).not.toBeNull();
  expect(requestPayload).toMatchObject({
    diners_count: 4,
    dishes_per_meal: 2,
    cooking_time_limit: 35,
    cuisines: "川菜、粤菜",
    disliked_ingredients: ["花生", "香菜"],
    force_regenerate: true,
  });
});

test("非法生成参数会定位到具体字段且不会启动任务", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.localStorage.setItem("yanhuofood.menuOnboardingCompleted", "true");
  });
  await page.route("**/api/preferences", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ preferences: {} }) }));
  await page.route("**/api/dish-feedback", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ feedback: [] }) }));
  await page.route("**/api/menus/generate", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ menus: [] }) }));

  let jobRequests = 0;
  await page.route("**/api/menus/generate-jobs", route => {
    jobRequests += 1;
    return route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ job_id: "unexpected", status: "queued" }) });
  });

  await page.goto("/menus");
  // 展开点击可能发生在水合完成前被吞掉，重试到高级字段真正出现。
  await expect(async () => {
    if (!(await page.locator("#menu-scenario").isVisible())) {
      await page.getByRole("button", { name: /高级条件/ }).click();
    }
    await expect(page.locator("#menu-scenario")).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await page.locator("#menu-scenario").selectOption("festival");
  await page.locator("#menu-festival-theme").fill("超".repeat(81));
  await page.locator("#menu-generate-action").first().click();

  await expect(page.locator("#menu-festival-theme-error")).toBeVisible();
  await expect(page.getByText("正在生成", { exact: true })).not.toBeVisible();
  expect(jobRequests).toBe(0);
});

test("非法数字输入会在提交前归一化", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.localStorage.setItem("yanhuofood.menuOnboardingCompleted", "true");
  });
  await page.route("**/api/preferences", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ preferences: {} }) }));
  await page.route("**/api/dish-feedback", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ feedback: [] }) }));
  await page.route("**/api/menus/generate", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ menus: [] }) }));

  let requestPayload: Record<string, unknown> | null = null;
  await page.route("**/api/menus/generate-jobs", async route => {
    requestPayload = JSON.parse(route.request().postData() || "{}");
    await route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ job_id: "clamp-job", status: "queued" }) });
  });

  await page.goto("/menus");
  // 展开点击可能发生在水合完成前被吞掉，重试到高级字段真正出现。
  await expect(async () => {
    if (!(await page.locator("#menu-dishes-per-meal").isVisible())) {
      await page.getByRole("button", { name: /高级条件/ }).click();
    }
    await expect(page.locator("#menu-dishes-per-meal")).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await page.locator("#menu-diners-count").fill("0");
  await page.locator("#menu-diners-count").blur();
  await page.locator("#menu-dishes-per-meal").fill("99");
  await page.locator("#menu-dishes-per-meal").blur();
  await page.locator("#menu-cooking-time-limit").fill("5");
  await page.locator("#menu-cooking-time-limit").blur();
  await page.locator("#menu-generate-action").first().click();

  await expect.poll(() => requestPayload).not.toBeNull();
  expect(requestPayload).toMatchObject({ diners_count: 1, dishes_per_meal: 6, cooking_time_limit: 10 });
});

test("历史菜单接口失败会显示错误而不是暂无菜单", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.localStorage.setItem("yanhuofood.menuOnboardingCompleted", "true");
  });
  await page.route("**/api/preferences", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ preferences: {} }) }));
  await page.route("**/api/dish-feedback", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ feedback: [] }) }));
  await page.route("**/api/menus/generate", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { message: "数据库暂不可用" } }) }));

  await page.goto("/menus");
  await expect(page.getByText("历史菜单加载失败", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("暂无历史菜单。", { exact: true })).not.toBeVisible();
});

test("Supabase 网络不可达时保留本地菜单并显示降级提示", async ({ page }) => {
  await page.addInitScript((menu) => {
    window.localStorage.clear();
    window.localStorage.setItem("yanhuofood.menuOnboardingCompleted", "true");
    window.localStorage.setItem("yanhuofood.localMenus", JSON.stringify([{
      id: "local-fallback-menu",
      start_date: menu.start_date,
      week_start: menu.week_start,
      end_date: menu.end_date,
      data: menu,
      source: "local",
    }]));
  }, completedMenu);
  await page.route("**/api/preferences", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ preferences: {}, localOnly: true, warning: "服务端偏好暂时不可用，已使用当前浏览器保存的偏好。" }),
  }));
  await page.route("**/api/dish-feedback", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ feedback: [] }) }));
  await page.route("**/api/menus/generate", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ menus: [], localOnly: true, warning: "服务端历史菜单暂时不可用，已切换为本浏览器菜单。" }),
  }));

  await page.goto("/menus");
  await expect(page.getByText("当前使用本浏览器菜单", { exact: true })).toBeVisible();
  await expect(page.getByText("服务端偏好暂时不可用，已使用当前浏览器保存的偏好。", { exact: true })).toBeVisible();
  await expect(page.getByText("燕麦鸡蛋杯", { exact: true })).toBeVisible();
  await expect(page.getByText("历史菜单加载失败", { exact: false })).not.toBeVisible();
});

test("食谱加载失败会显示错误和重试操作", async ({ page }) => {
  await page.route("**/api/recipes", route => route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({ error: "数据库暂不可用" }),
  }));

  await page.goto("/recipes");
  await expect(page.getByText("食谱加载失败：数据库暂不可用", { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: "重新加载" })).toBeVisible();
});

test("新增食谱失败时保留表单并显示错误", async ({ page }) => {
  await page.route("**/api/recipes", route => {
    if (route.request().method() === "GET") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ recipes: [] }) });
    }
    return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "保存服务暂不可用" }) });
  });

  await page.goto("/recipes");
  // 点击可能发生在水合完成前被吞掉，重试到表单真正出现。
  await expect(async () => {
    await page.getByRole("button", { name: "添加食谱" }).click();
    await expect(page.getByPlaceholder("例如：番茄牛腩")).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await page.getByPlaceholder("例如：番茄牛腩").fill("测试食谱");
  await page.getByRole("button", { name: "保存", exact: true }).click();

  await expect(page.getByText("保存失败：保存服务暂不可用", { exact: true })).toBeVisible();
  await expect(page.getByPlaceholder("例如：番茄牛腩")).toHaveValue("测试食谱");
});

test("样例菜单会明确提示并限制执行操作", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.localStorage.setItem("yanhuofood.menuOnboardingCompleted", "true");
  });
  await page.route("**/api/preferences", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ preferences: {} }) }));
  await page.route("**/api/dish-feedback", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ feedback: [] }) }));
  await page.route("**/api/menus/generate", route => {
    if (route.request().method() === "GET") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ menus: [] }) });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ menu: completedMenu, source: "sample", warnings: ["AI 超时，已使用样例菜单。"] }),
    });
  });
  await page.route("**/api/menus/generate-jobs", route => route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({ error: { code: "JOB_CREATE_FAILED", message: "任务服务暂不可用" } }),
  }));

  await page.goto("/menus");
  await page.locator("#menu-generate-action").first().click();

  await expect(page.getByText("当前是通用样例菜单，不是完整的个性化 AI 结果", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "加入食谱库" })).toBeDisabled();
});

test("失效的恢复任务会停止轮询并清除本地任务", async ({ page }) => {
  let pollCount = 0;
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.localStorage.setItem("yanhuofood.menuOnboardingCompleted", "true");
    window.localStorage.setItem("yanhuofood.activeMenuGenerationJob", JSON.stringify({
      jobId: "expired-job",
      status: "running",
      startedAt: new Date().toISOString(),
    }));
  });
  await page.route("**/api/preferences", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ preferences: {} }) }));
  await page.route("**/api/dish-feedback", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ feedback: [] }) }));
  await page.route("**/api/menus/generate", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ menus: [] }) }));
  await page.route("**/api/menus/generate-jobs/expired-job", route => {
    pollCount += 1;
    return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: { code: "JOB_NOT_FOUND", message: "任务已失效" } }) });
  });

  await page.goto("/menus");
  await expect(page.getByText("任务已失效", { exact: false })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("yanhuofood.activeMenuGenerationJob"))).toBeNull();
  await page.waitForTimeout(1600);
  expect(pollCount).toBeLessThanOrEqual(2);
});

test("食材页默认阻止样例菜单直接进入采购", async ({ page }) => {
  await page.addInitScript((menu) => {
    window.localStorage.clear();
    window.localStorage.setItem("yanhuofood.localMenus", JSON.stringify([{
      id: "sample-menu",
      start_date: menu.start_date,
      week_start: menu.week_start,
      end_date: menu.end_date,
      data: menu,
      source: "sample",
    }]));
  }, completedMenu);
  await page.route("**/api/menus/generate", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ menus: [] }) }));
  let ingredientRequests = 0;
  await page.route("**/api/ingredients", route => {
    ingredientRequests += 1;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ingredients: [], grouped: {}, total: 0 }) });
  });
  await page.route("**/api/ingredients/state**", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) }));

  await page.goto("/ingredients");
  await page.getByRole("combobox").first().selectOption(completedMenu.start_date);

  await expect(page.getByText("这是通用样例菜单，采购清单默认已暂停", { exact: true })).toBeVisible();
  await expect(page.getByText("采购清单尚未生成", { exact: false })).toBeVisible();
  expect(ingredientRequests).toBe(0);

  await page.getByLabel("我已逐项核对样例菜单，仍要生成采购清单").check();
  await expect.poll(() => ingredientRequests).toBe(1);
});
