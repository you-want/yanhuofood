import { expect, test } from "@playwright/test";

const RICH_RECIPE = {
  id: "trusted-tomato-chicken",
  is_public: true,
  name: "番茄鸡胸肉",
  cuisine: "中式",
  calories: 420,
  ingredients: ["番茄", "鸡胸肉"],
  instructions: "切配食材\n炒熟鸡肉后加入番茄",
  tags: ["家常", "快手"],
  source_recipe_id: "system-tomato-chicken",
  source_url: "https://example.test/recipes/tomato-chicken",
  source_name: "烟火食间可信菜谱库",
  servings: 2,
  cooking_time_minutes: 20,
  difficulty: "easy",
  ingredient_details: [
    { name: "番茄", normalized_name: "番茄", amount: 300, unit: "g", category: "vegetable" },
    { name: "鸡胸肉", normalized_name: "鸡胸肉", amount: 200, unit: "g", category: "meat" },
  ],
  steps: [{ index: 1, instruction: "切配食材" }, { index: 2, instruction: "炒熟鸡肉后加入番茄" }],
  quality_status: "reviewed",
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/recipes", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ recipes: [RICH_RECIPE] }) });
      return;
    }
    await route.continue();
  });
});

test("食谱详情展示可信来源、结构化字段和问答快捷入口", async ({ page }) => {
  let askBody: Record<string, unknown> | null = null;
  await page.route("**/api/recipes/ask", async (route) => {
    askBody = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        question_type: "why_recommended",
        answer: "因为它符合快手和高蛋白方向。",
        suggestions: [{ title: "推荐依据", detail: "20 分钟左右可完成" }],
        warnings: [],
        sources: [{ source_recipe_id: RICH_RECIPE.source_recipe_id, name: RICH_RECIPE.source_name, url: RICH_RECIPE.source_url }],
        confidence: "high",
        generation: { source: "ai", warning: null },
      }),
    });
  });

  await page.goto("/recipes");
  await page.getByRole("button", { name: "查看详情", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: RICH_RECIPE.name });
  await expect(dialog.getByText("已审核菜谱")).toBeVisible();
  await expect(dialog.getByText("2 人份")).toBeVisible();
  await expect(dialog.getByText("鸡胸肉 200g")).toBeVisible();
  await expect(dialog.getByText("围绕这道菜提问")).toBeVisible();

  await dialog.getByRole("button", { name: "为什么推荐" }).click();
  await expect(dialog.getByText("因为它符合快手和高蛋白方向。")).toBeVisible();
  await expect.poll(() => askBody).not.toBeNull();
  expect(askBody).toMatchObject({
    question_type: "why_recommended",
    diners_count: 2,
    recipe: { id: RICH_RECIPE.id, source_recipe_id: RICH_RECIPE.source_recipe_id },
  });
});

test("菜谱问答 API 会校验请求，并可在本地模型失败时规则降级", async ({ request }) => {
  const invalid = await request.post("/api/recipes/ask", { data: { question: "怎么做" } });
  expect(invalid.status()).toBe(400);

  const response = await request.post("/api/recipes/ask", {
    data: {
      recipe: RICH_RECIPE,
      question: "改成四人份怎么调整？",
      question_type: "adjust_servings",
      diners_count: 4,
      model_config: {
        enabled: true,
        provider: "openai_compatible",
        api_key: "local-test-key",
        base_url: "http://127.0.0.1:9/v1",
        model: "local-test-model",
      },
    },
  });
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.question_type).toBe("adjust_servings");
  expect(body.answer).toContain("按人数比例缩放");
  expect(body.generation.source).toBe("rules");
});
