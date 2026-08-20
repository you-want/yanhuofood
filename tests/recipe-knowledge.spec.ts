import { expect, test } from "@playwright/test";
import { hydrateMenuWithTrustedRecipes } from "../lib/domain/recipe-grounding";
import { normalizeIngredientName, normalizeRecipe } from "../lib/domain/recipe-normalize";
import { classifyRecipeQuestion, buildRuleBasedRecipeAnswer } from "../lib/domain/recipe-question";
import { rankRecipeCandidates, recipeViolatesHardConstraints } from "../lib/domain/recipe-search";
import type { Menu, Preferences, Recipe } from "../lib/types";

function recipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: "recipe-1",
    is_public: true,
    name: "番茄鸡胸肉",
    cuisine: "中式",
    calories: 420,
    ingredients: ["番茄", "鸡胸肉"],
    instructions: "切配食材\n炒熟鸡肉\n加入番茄",
    tags: ["家常", "快手"],
    source_recipe_id: "system-tomato-chicken",
    servings: 2,
    cooking_time_minutes: 20,
    difficulty: "easy",
    ingredient_details: [
      { name: "番茄", normalized_name: "番茄", amount: 300, unit: "g", category: "vegetable" },
      { name: "鸡胸肉", normalized_name: "鸡胸肉", amount: 200, unit: "g", category: "meat" },
    ],
    seasonings: [{ name: "盐", normalized_name: "盐", amount: 2, unit: "g", category: "seasoning" }],
    steps: [{ index: 1, instruction: "切配食材" }, { index: 2, instruction: "炒熟鸡肉后加入番茄" }],
    quality_status: "reviewed",
    health_goals: ["high_protein"],
    meal_types: ["lunch", "dinner"],
    ...overrides,
  };
}

const prefs: Preferences = {
  cuisines: "中式",
  dietary_restrictions: [],
  disliked_ingredients: [],
  health_goal: "high_protein",
  cooking_time_limit: 30,
  diners_count: 4,
};

test("旧食谱字段可归一为结构化食材和步骤", () => {
  const normalized = normalizeRecipe({
    id: "legacy",
    name: "西红柿炒蛋",
    cuisine: "中式",
    calories: 360,
    ingredients: ["西红柿", "鸡蛋"],
    instructions: "切西红柿\n炒鸡蛋",
  });
  expect(normalized.ingredient_details?.map((item) => item.normalized_name)).toEqual(["番茄", "鸡蛋"]);
  expect(normalized.steps?.map((step) => step.instruction)).toEqual(["切西红柿", "炒鸡蛋"]);
});

test("常见食材别名会统一归一化", () => {
  expect(normalizeIngredientName("西红柿")).toBe("番茄");
  expect(normalizeIngredientName("马铃薯（去皮）")).toBe("土豆");
});

test("可信候选会排除忌口和清真冲突，并保留可解释排序", () => {
  const pork = recipe({ id: "pork", name: "红烧五花肉", ingredient_details: [{ name: "五花肉", normalized_name: "五花肉", category: "meat" }] });
  expect(recipeViolatesHardConstraints(pork, { ...prefs, halal: true })).toBe(true);
  expect(recipeViolatesHardConstraints(recipe(), { ...prefs, disliked_ingredients: ["番茄"] })).toBe(true);

  const ranked = rankRecipeCandidates([recipe(), recipe({ id: "slow", name: "慢炖牛肉", cooking_time_minutes: 90, health_goals: [] })], prefs);
  expect(ranked[0].recipe.name).toBe("番茄鸡胸肉");
  expect(ranked[0].reasons).toContain("符合菜系偏好");
  expect(ranked[0].reasons).toContain("匹配健康目标");
});

test("菜单 grounding 使用可信菜谱并按人数缩放食材", () => {
  const menu: Menu = {
    week_start: "2026-07-24",
    days: [{ day: "Fri", meals: [{ name: "番茄鸡胸肉", calories: 420, dishes: [{ name: "番茄鸡胸肉", source_recipe_id: "system-tomato-chicken" }] }] }],
  };
  const candidate = { recipe: recipe(), score: 80, reasons: ["匹配健康目标"], matched_ingredients: [] };
  const result = hydrateMenuWithTrustedRecipes(menu, [candidate], 4);
  const dish = result.menu.days[0].meals[0].dishes?.[0];
  expect(result.groundedCount).toBe(1);
  expect(result.generatedCount).toBe(0);
  expect(dish?.source_kind).toBe("trusted");
  expect(dish?.ingredients?.find((item) => item.name === "鸡胸肉")?.amount).toBe(400);
  expect(dish?.evidence?.reasons).toEqual(["匹配健康目标"]);
});

test("没有可信候选时保留生成菜品标记", () => {
  const menu: Menu = {
    week_start: "2026-07-24",
    days: [{ day: "Fri", meals: [{ name: "临时创意菜", calories: 300, dishes: [{ name: "临时创意菜", calories: 300 }] }] }],
  };
  const result = hydrateMenuWithTrustedRecipes(menu, [], 2);
  expect(result.groundedCount).toBe(0);
  expect(result.generatedCount).toBe(1);
  expect(result.menu.days[0].meals[0].dishes?.[0].source_kind).toBe("generated");
});

test("菜谱问题分类和规则回答覆盖首版快捷问题", () => {
  expect(classifyRecipeQuestion("这道菜为什么推荐给我？")).toBe("why_recommended");
  expect(classifyRecipeQuestion("没有烤箱怎么做？")).toBe("equipment_alternative");
  expect(classifyRecipeQuestion("改成四人份要多少？")).toBe("adjust_servings");
  const answer = buildRuleBasedRecipeAnswer({ recipe: recipe(), question: "改成四人份", dinersCount: 4 });
  expect(answer.question_type).toBe("adjust_servings");
  expect(answer.suggestions[0].detail).toContain("鸡胸肉约 400g");
});
