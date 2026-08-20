import { z } from "zod";

export const mealTypeSchema = z.enum(["breakfast", "lunch", "dinner", "snack"]);
export const periodTypeSchema = z.enum(["day", "week"]);
export const healthGoalSchema = z.enum(["balanced", "fat_loss", "high_protein", "low_sugar", "muscle_gain"]);
export const budgetLevelSchema = z.enum(["low", "medium", "high"]);
export const menuScenarioSchema = z.enum(["daily_home", "travel", "work_takeout", "batch_cooking", "festival"]);

export const festivalTypeSchema = z.enum([
  "spring_festival",
  "lantern_festival",
  "dragon_boat",
  "mid_autumn",
  "double_ninth",
  "new_year",
  "christmas",
  "thanksgiving",
  "other",
]);

const ingredientCategoryEnum = z.enum([
  "grain",
  "meat",
  "seafood",
  "egg_dairy",
  "vegetable",
  "fruit",
  "soy",
  "seasoning",
  "other",
]);

const ingredientCategoryMap: Record<string, z.infer<typeof ingredientCategoryEnum>> = {
  grain: "grain",
  staple: "grain",
  rice: "grain",
  主食: "grain",
  谷物: "grain",
  米面: "grain",
  米面粮油: "grain",
  肉类: "meat",
  禽肉: "meat",
  畜肉: "meat",
  猪肉: "meat",
  牛肉: "meat",
  鸡肉: "meat",
  羊肉: "meat",
  meat: "meat",
  seafood: "seafood",
  水产: "seafood",
  海鲜: "seafood",
  鱼虾: "seafood",
  鱼类: "seafood",
  虾类: "seafood",
  egg_dairy: "egg_dairy",
  egg: "egg_dairy",
  dairy: "egg_dairy",
  蛋奶: "egg_dairy",
  蛋类: "egg_dairy",
  鸡蛋: "egg_dairy",
  牛奶: "egg_dairy",
  乳制品: "egg_dairy",
  vegetable: "vegetable",
  vegetables: "vegetable",
  蔬菜: "vegetable",
  菌菇: "vegetable",
  菇类: "vegetable",
  fruit: "fruit",
  fruits: "fruit",
  水果: "fruit",
  soy: "soy",
  bean: "soy",
  tofu: "soy",
  豆类: "soy",
  豆制品: "soy",
  豆腐: "soy",
  seasoning: "seasoning",
  condiment: "seasoning",
  spice: "seasoning",
  调料: "seasoning",
  调味料: "seasoning",
  香料: "seasoning",
  佐料: "seasoning",
  other: "other",
  其他: "other",
};

function normalizeMappedValue(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase().replace(/[\s_-]+/g, "_") : value;
}

function normalizeIngredientCategory(value: unknown) {
  const normalized = normalizeMappedValue(value);
  if (typeof normalized !== "string") return "other";
  return ingredientCategoryMap[normalized] || "other";
}

function normalizeMealType(value: unknown) {
  const normalized = normalizeMappedValue(value);
  if (normalized === "早餐" || normalized === "早饭" || normalized === "breakfast") return "breakfast";
  if (normalized === "午餐" || normalized === "午饭" || normalized === "lunch") return "lunch";
  if (normalized === "晚餐" || normalized === "晚饭" || normalized === "dinner") return "dinner";
  if (normalized === "加餐" || normalized === "点心" || normalized === "snack") return "snack";
  return normalized;
}

function normalizeDifficulty(value: unknown) {
  const normalized = normalizeMappedValue(value);
  if (normalized === "简单" || normalized === "容易" || normalized === "easy") return "easy";
  if (normalized === "中等" || normalized === "普通" || normalized === "medium") return "medium";
  if (normalized === "困难" || normalized === "复杂" || normalized === "hard") return "hard";
  return normalized;
}

function normalizeOptionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || trimmed === "适量" || trimmed === "少许") return undefined;
    const match = trimmed.match(/\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : undefined;
  }
  return value;
}

function normalizeOptionalPositiveNumber(value: unknown) {
  const normalized = normalizeOptionalNumber(value);
  if (typeof normalized === "number" && normalized <= 0) return undefined;
  return normalized;
}

function normalizeOptionalString(value: unknown) {
  if (value === null || value === undefined) return undefined;
  return value;
}

export const ingredientCategorySchema = z.preprocess(normalizeIngredientCategory, ingredientCategoryEnum);

export const nutritionSummarySchema = z.object({
  calories: z.preprocess(normalizeOptionalNumber, z.coerce.number().nonnegative().optional()),
  protein_g: z.preprocess(normalizeOptionalNumber, z.coerce.number().nonnegative().optional()),
  fat_g: z.preprocess(normalizeOptionalNumber, z.coerce.number().nonnegative().optional()),
  carbs_g: z.preprocess(normalizeOptionalNumber, z.coerce.number().nonnegative().optional()),
  fiber_g: z.preprocess(normalizeOptionalNumber, z.coerce.number().nonnegative().optional()),
  sodium_mg: z.preprocess(normalizeOptionalNumber, z.coerce.number().nonnegative().optional()),
});

export const ingredientUsageSchema = z.object({
  name: z.string().trim().min(1),
  amount: z.preprocess(normalizeOptionalNumber, z.coerce.number().nonnegative().optional()),
  unit: z.preprocess(normalizeOptionalString, z.string().trim().optional()),
  category: ingredientCategorySchema.default("other"),
  optional: z.boolean().optional(),
});

export const dishSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1),
  ingredients: z.array(ingredientUsageSchema).default([]),
  seasonings: z.array(ingredientUsageSchema).default([]),
  steps: z.array(z.string().trim().min(1)).default([]),
  calories: z.preprocess(normalizeOptionalNumber, z.coerce.number().nonnegative().optional()),
  nutrition: nutritionSummarySchema.optional(),
  cooking_time_minutes: z.preprocess(normalizeOptionalPositiveNumber, z.coerce.number().int().positive().optional()),
  difficulty: z.preprocess(normalizeDifficulty, z.enum(["easy", "medium", "hard"]).optional()),
  tags: z.array(z.string().trim().min(1)).default([]),
  source_kind: z.enum(["trusted", "generated"]).optional(),
  source_recipe_id: z.string().trim().min(1).optional(),
  source_url: z.string().url().nullable().optional(),
  source_name: z.string().trim().min(1).optional(),
  evidence: z.object({
    source_recipe_id: z.string().trim().min(1),
    source_name: z.string().trim().min(1),
    source_url: z.string().url().nullable().optional(),
    reasons: z.array(z.string().trim().min(1)).default([]),
    score: z.number().optional(),
    quality_status: z.enum(["draft", "normalized", "reviewed", "deprecated"]).optional(),
  }).optional(),
  servings: z.preprocess(normalizeOptionalPositiveNumber, z.coerce.number().positive().optional()),
  adaptation_note: z.string().trim().max(500).optional(),
});

export const mealSchema = z.object({
  id: z.string().optional(),
  type: z.preprocess(normalizeMealType, mealTypeSchema.optional()),
  title: z.string().trim().optional(),
  dishes: z.array(dishSchema).default([]),
  name: z.string().trim().default(""),
  calories: z.preprocess(normalizeOptionalNumber, z.coerce.number().nonnegative().default(0)),
  nutrition: nutritionSummarySchema.optional(),
  reason: z.string().trim().optional(),
  warnings: z.array(z.string().trim().min(1)).default([]),
});

export const daySchema = z.object({
  date: z.string().optional(),
  day: z.string().trim().min(1),
  meals: z.array(mealSchema).default([]),
  nutrition: nutritionSummarySchema.optional(),
});

export const menuSchema = z.object({
  week_start: z.string().trim().min(1).optional(),
  period_type: periodTypeSchema.default("week"),
  start_date: z.string().trim().min(1).optional(),
  end_date: z.string().optional(),
  days: z.array(daySchema).min(1),
  summary: nutritionSummarySchema.optional(),
  schema_version: z.coerce.number().int().positive().default(2),
}).refine((menu) => !!menu.start_date || !!menu.week_start, {
  message: "Menu must include start_date or week_start",
  path: ["start_date"],
});

export const preferencesSchema = z.object({
  cuisines: z.string().optional(),
  dietary_restrictions: z.array(z.string()).default([]),
  disliked_ingredients: z.array(z.string()).default([]),
  halal: z.boolean().default(false),
  light_meal: z.boolean().default(false),
  special_group: z.enum(["children", "elderly", "pregnant"]).nullable().optional(),
  energy_display: z.enum(["auto", "on", "off"]).default("auto"),
  days: z.union([z.literal(5), z.literal(7)]).default(7),
  meal_count: z.coerce.number().int().min(1).max(6).default(3),
  diners_count: z.coerce.number().int().min(1).max(20).default(1),
  dishes_per_meal: z.coerce.number().int().min(1).max(6).default(1),
  health_goal: healthGoalSchema.optional(),
  budget_level: budgetLevelSchema.optional(),
  cooking_time_limit: z.coerce.number().int().positive().optional(),
});

export const localModelConfigSchema = z.object({
  enabled: z.boolean().default(false),
  provider: z.enum(["openai", "openai_compatible"]).default("openai"),
  api_key: z.string().optional(),
  base_url: z.string().optional(),
  model: z.string().min(1).default("gpt-4o-mini"),
});

const dishFeedbackSummarySchema = z.object({
  liked_dishes: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  blocked_dishes: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  cooked_dishes: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
});

export const generateMenuRequestSchema = z.object({
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  mealCount: z.coerce.number().int().min(1).max(6).optional(),
  days: z.union([z.literal(1), z.literal(5), z.literal(7)]).optional(),
  dishes_per_meal: z.coerce.number().int().min(1).max(6).optional(),
  energy_display: z.enum(["auto", "on", "off"]).optional(),
  halal: z.boolean().optional(),
  light_meal: z.boolean().optional(),
  special_group: z.enum(["children", "elderly", "pregnant"]).nullable().optional(),
  cuisines: z.string().trim().max(200).optional(),
  dietary_restrictions: z.array(z.string().trim().min(1).max(80)).max(30).transform((items) => Array.from(new Set(items))).optional(),
  disliked_ingredients: z.array(z.string().trim().min(1).max(80)).max(30).transform((items) => Array.from(new Set(items))).optional(),
  diners_count: z.coerce.number().int().min(1).max(20).optional(),
  health_goal: healthGoalSchema.optional(),
  budget_level: budgetLevelSchema.optional(),
  cooking_time_limit: z.coerce.number().int().min(10).max(180).optional(),
  scenario: menuScenarioSchema.optional(),
  festival_type: festivalTypeSchema.optional(),
  festival_theme: z.string().max(80).optional(),
  feedback_summary: dishFeedbackSummarySchema.optional(),
  model_config: localModelConfigSchema.optional(),
  force_regenerate: z.boolean().optional(),
}).superRefine((data, ctx) => {
  if (data.scenario === "festival" && !data.festival_type && !data.festival_theme?.trim()) {
    ctx.addIssue({ code: "custom", path: ["festival_type"], message: "节日聚餐需要选择节日类型或填写聚餐主题" });
  }
});

export const todayMealContextSchema = z.object({
  meal_moment: z.enum(["breakfast", "lunch", "dinner", "late_night"]),
  diners_count: z.coerce.number().int().min(1).max(20),
  dishes_count: z.coerce.number().int().min(1).max(6).default(1),
  appetite: z.enum(["low", "normal", "high"]),
  physical_state: z.enum(["normal", "tired", "stomach_discomfort", "after_workout"]),
  occasion: z.enum(["solo", "family", "friends", "guests"]),
  available_minutes: z.coerce.number().int().min(15).max(180),
  available_ingredients: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  note: z.string().trim().max(200).optional(),
});

export const todayMealOptionSchema = z.object({
  id: z.string().trim().min(1),
  kind: z.enum(["best_match", "quick", "different"]),
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  reason: z.string().trim().min(1),
  dish: dishSchema.optional(),
  dishes: z.array(dishSchema).min(1).optional(),
  warnings: z.array(z.string().trim().min(1)).default([]),
}).superRefine((option, ctx) => {
  if (!option.dish && !option.dishes?.length) {
    ctx.addIssue({ code: "custom", message: "候选方案至少需要一个菜", path: ["dishes"] });
  }
}).transform((option) => {
  const dishes = option.dishes?.length ? option.dishes : [option.dish!];
  return { ...option, dish: option.dish || dishes[0], dishes };
});

export const todayMealRecommendationSchema = z.object({
  options: z.array(todayMealOptionSchema).length(3),
  guidance: z.string().trim().min(1),
}).superRefine((value, ctx) => {
  const kinds = new Set(value.options.map((option) => option.kind));
  if (kinds.size !== 3) ctx.addIssue({ code: "custom", message: "三个候选类型必须各不相同", path: ["options"] });
});

export const todayMealRequestSchema = z.object({
  context: todayMealContextSchema,
  cuisines: z.string().trim().max(100).optional(),
  dietary_restrictions: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  disliked_ingredients: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  health_goal: healthGoalSchema.default("balanced"),
  budget_level: budgetLevelSchema.default("medium"),
  feedback_summary: dishFeedbackSummarySchema.optional(),
  model_config: localModelConfigSchema.optional(),
});

export type MenuInput = z.infer<typeof menuSchema>;
