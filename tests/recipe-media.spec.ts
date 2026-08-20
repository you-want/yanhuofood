import { expect, test } from "@playwright/test";

const MEDIA_RECIPE = {
  id: "media-recipe",
  is_public: false,
  name: "葱油拌面",
  cuisine: "中式",
  calories: 460,
  ingredients: ["面条 200g", "小葱 30g", "生抽 2勺"],
  instructions: "熬制葱油\n煮熟面条\n加入调味料拌匀",
  tags: ["快手菜", "面食"],
  image_url: "https://images.example.test/scallion-noodles.jpg",
  video_url: "https://www.douyin.com/video/123456789",
  video_search_keyword: "葱油拌面 家常做法",
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/recipes", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ recipes: [MEDIA_RECIPE] }),
      });
      return;
    }
    await route.continue();
  });

  await page.route(MEDIA_RECIPE.image_url, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"><rect width="800" height="450" fill="#d1fae5"/></svg>',
    });
  });
});

test("食谱详情展示图片并提供视频和抖音搜索入口", async ({ page }) => {
  await page.goto("/recipes");

  await expect(page.getByRole("img", { name: "葱油拌面成品图" })).toBeVisible();
  await page.getByRole("button", { name: "查看详情", exact: true }).click();

  const dialog = page.getByRole("dialog", { name: "葱油拌面" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("img", { name: "葱油拌面成品图" })).toBeVisible();
  await expect(dialog.getByText("1. 熬制葱油")).toBeVisible();

  await expect(dialog.getByRole("link", { name: /打开制作视频/ })).toHaveAttribute(
    "href",
    MEDIA_RECIPE.video_url
  );
  await expect(dialog.getByRole("link", { name: /在抖音搜索做法/ })).toHaveAttribute(
    "href",
    `https://www.douyin.com/search/${encodeURIComponent(MEDIA_RECIPE.video_search_keyword)}`
  );

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("新增食谱会提交图片、视频和搜索关键词", async ({ page }) => {
  let submittedBody: Record<string, unknown> | null = null;
  await page.route("**/api/recipes", async (route) => {
    if (route.request().method() === "POST") {
      submittedBody = route.request().postDataJSON();
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ recipe: { id: "created-recipe", ...submittedBody } }),
      });
      return;
    }
    await route.fallback();
  });

  await page.goto("/recipes");
  // 点击可能发生在水合完成前被吞掉，重试到表单真正出现。
  await expect(async () => {
    await page.getByRole("button", { name: "添加食谱" }).click();
    await expect(page.getByPlaceholder("例如：番茄牛腩")).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await page.getByPlaceholder("例如：番茄牛腩").fill("蒜香排骨");
  await page.getByLabel("菜品图片网址").fill("https://images.example.test/ribs.jpg");
  await page.getByLabel("制作视频网址").fill("https://www.douyin.com/video/987654321");
  await page.getByLabel("抖音搜索关键词").fill("蒜香排骨 做法");
  await page.getByRole("button", { name: "保存", exact: true }).click();

  await expect.poll(() => submittedBody).not.toBeNull();
  expect(submittedBody).toMatchObject({
    name: "蒜香排骨",
    image_url: "https://images.example.test/ribs.jpg",
    video_url: "https://www.douyin.com/video/987654321",
    video_search_keyword: "蒜香排骨 做法",
  });
});
