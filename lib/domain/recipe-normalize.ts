import type { IngredientCategory, Recipe, RecipeIngredientDetail, RecipeSource, RecipeSourceType, RecipeStep } from "@/lib/types";

const BUILTIN_ALIASES: Record<string, string> = {
  西红柿: "番茄",
  马铃薯: "土豆",
  鸡脯肉: "鸡胸肉",
  鸡胸: "鸡胸肉",
  鸡腿: "鸡腿肉",
  去皮鸡腿肉: "鸡腿肉",
  青葱: "小葱",
  香葱: "小葱",
  酱油: "生抽",
  北豆腐: "豆腐",
  嫩豆腐: "豆腐",
  无糖酸奶: "酸奶",
};

const CATEGORIES = new Set<IngredientCategory>([
  "grain", "meat", "seafood", "egg_dairy", "vegetable", "fruit", "soy", "seasoning", "other",
]);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => asString(item)).filter(Boolean) : [];
}

function asOptionalNumber(value: unknown) {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

function asJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const SOURCE_TYPES = new Set<RecipeSourceType>([
  "system_curated", "open_source", "user_created", "ai_generated", "manual_import",
]);

function normalizeRecipeSource(value: unknown): RecipeSource | undefined {
  const row = asRecord(value);
  const id = asString(row.id);
  const slug = asString(row.slug);
  const name = asString(row.name);
  const sourceType = asString(row.source_type) as RecipeSourceType;
  if (!id || !slug || !name || !SOURCE_TYPES.has(sourceType)) return undefined;
  return {
    id,
    slug,
    name,
    source_type: sourceType,
    homepage_url: row.homepage_url === null ? null : asString(row.homepage_url) || undefined,
    license_name: row.license_name === null ? null : asString(row.license_name) || undefined,
    license_url: row.license_url === null ? null : asString(row.license_url) || undefined,
    attribution_text: row.attribution_text === null ? null : asString(row.attribution_text) || undefined,
    source_revision: row.source_revision === null ? null : asString(row.source_revision) || undefined,
  };
}

export function normalizeIngredientName(value: string, aliases: Record<string, string> = {}) {
  const compact = value.trim().toLowerCase().replace(/[\s·•]+/g, "").replace(/[（(].*?[）)]/g, "");
  return aliases[compact] || BUILTIN_ALIASES[compact] || compact;
}

function normalizeIngredient(value: unknown, fallbackCategory: IngredientCategory = "other"): RecipeIngredientDetail | null {
  if (typeof value === "string") {
    const name = value.trim();
    return name ? { name, normalized_name: normalizeIngredientName(name), category: fallbackCategory } : null;
  }
  const row = asRecord(value);
  const name = asString(row.name);
  if (!name) return null;
  const rawCategory = asString(row.category) as IngredientCategory;
  return {
    name,
    normalized_name: asString(row.normalized_name) || normalizeIngredientName(name),
    amount: asOptionalNumber(row.amount),
    unit: asString(row.unit) || undefined,
    category: CATEGORIES.has(rawCategory) ? rawCategory : fallbackCategory,
    optional: typeof row.optional === "boolean" ? row.optional : undefined,
  };
}

function normalizeSteps(value: unknown, legacyInstructions: string): RecipeStep[] {
  const rows = asJsonArray(value).map((item, index) => {
    if (typeof item === "string") return { index: index + 1, instruction: item.trim() };
    const row = asRecord(item);
    return {
      index: asOptionalNumber(row.index) || index + 1,
      instruction: asString(row.instruction || row.text || row.step),
      duration_minutes: asOptionalNumber(row.duration_minutes),
    };
  }).filter((step) => step.instruction);
  if (rows.length) return rows;
  return legacyInstructions
    .split(/\r?\n|(?<=[。！？；])\s*/)
    .map((instruction) => instruction.trim())
    .filter(Boolean)
    .map((instruction, index) => ({ index: index + 1, instruction }));
}

export function legacyIngredientsFromDetails(details: RecipeIngredientDetail[], seasonings: RecipeIngredientDetail[] = []) {
  return [...details, ...seasonings].map((item) => item.name);
}

export function legacyInstructionsFromSteps(steps: RecipeStep[]) {
  return steps.map((step) => step.instruction).join("\n");
}

export function normalizeRecipe(value: unknown): Recipe {
  const row = asRecord(value);
  const legacyIngredients = asStringArray(row.ingredients);
  const ingredientDetails = asJsonArray(row.ingredient_details)
    .map((item) => normalizeIngredient(item))
    .filter((item): item is RecipeIngredientDetail => Boolean(item));
  const seasonings = asJsonArray(row.seasonings)
    .map((item) => normalizeIngredient(item, "seasoning"))
    .filter((item): item is RecipeIngredientDetail => Boolean(item));
  const details = ingredientDetails.length
    ? ingredientDetails
    : legacyIngredients.map((name) => normalizeIngredient(name)).filter((item): item is RecipeIngredientDetail => Boolean(item));
  const instructions = asString(row.instructions);
  const steps = normalizeSteps(row.steps, instructions);
  const nutrition = asRecord(row.nutrition);
  const source = normalizeRecipeSource(row.source || row.recipe_sources);
  const calories = asOptionalNumber(row.calories) ?? asOptionalNumber(nutrition.calories) ?? 0;

  return {
    id: asString(row.id) || asString(row.source_recipe_id) || "unknown-recipe",
    client_id: row.client_id === null ? null : asString(row.client_id) || undefined,
    is_public: Boolean(row.is_public),
    name: asString(row.name) || "未命名食谱",
    cuisine: asString(row.cuisine) || "未分类",
    calories,
    ingredients: legacyIngredients.length ? legacyIngredients : legacyIngredientsFromDetails(details, seasonings),
    instructions: instructions || legacyInstructionsFromSteps(steps),
    tags: asStringArray(row.tags),
    image_url: row.image_url === null ? null : asString(row.image_url) || undefined,
    video_url: row.video_url === null ? null : asString(row.video_url) || undefined,
    video_search_keyword: row.video_search_keyword === null ? null : asString(row.video_search_keyword) || undefined,
    source_id: row.source_id === null ? null : asString(row.source_id) || undefined,
    source_recipe_id: row.source_recipe_id === null ? null : asString(row.source_recipe_id) || undefined,
    source_url: row.source_url === null ? null : asString(row.source_url) || undefined,
    source,
    servings: asOptionalNumber(row.servings),
    cooking_time_minutes: asOptionalNumber(row.cooking_time_minutes),
    prep_time_minutes: asOptionalNumber(row.prep_time_minutes),
    difficulty: ["easy", "medium", "hard"].includes(asString(row.difficulty)) ? asString(row.difficulty) as Recipe["difficulty"] : undefined,
    ingredient_details: details,
    steps,
    seasonings,
    nutrition: Object.keys(nutrition).length ? {
      calories: asOptionalNumber(nutrition.calories),
      protein_g: asOptionalNumber(nutrition.protein_g),
      fat_g: asOptionalNumber(nutrition.fat_g),
      carbs_g: asOptionalNumber(nutrition.carbs_g),
      fiber_g: asOptionalNumber(nutrition.fiber_g),
      sodium_mg: asOptionalNumber(nutrition.sodium_mg),
    } : { calories },
    equipment: asStringArray(row.equipment),
    dietary_flags: asStringArray(row.dietary_flags),
    health_goals: asStringArray(row.health_goals),
    meal_types: asStringArray(row.meal_types).filter((item) => ["breakfast", "lunch", "dinner", "snack"].includes(item)) as Recipe["meal_types"],
    schema_version: asOptionalNumber(row.schema_version),
    content_hash: row.content_hash === null ? null : asString(row.content_hash) || undefined,
    quality_status: ["draft", "normalized", "reviewed", "deprecated"].includes(asString(row.quality_status)) ? asString(row.quality_status) as Recipe["quality_status"] : undefined,
    imported_at: row.imported_at === null ? null : asString(row.imported_at) || undefined,
  };
}

export function recipeKnowledgePayload(input: Partial<Recipe>) {
  const ingredientDetails = input.ingredient_details?.length
    ? input.ingredient_details
    : (input.ingredients || []).map((name) => ({ name, normalized_name: normalizeIngredientName(name), category: "other" as const }));
  const steps = input.steps?.length
    ? input.steps
    : (input.instructions || "").split(/\r?\n/).map((instruction) => instruction.trim()).filter(Boolean).map((instruction, index) => ({ index: index + 1, instruction }));
  return {
    servings: input.servings,
    cooking_time_minutes: input.cooking_time_minutes,
    prep_time_minutes: input.prep_time_minutes,
    difficulty: input.difficulty,
    ingredient_details: ingredientDetails,
    steps,
    seasonings: input.seasonings || [],
    nutrition: input.nutrition || { calories: input.calories },
    equipment: input.equipment || [],
    dietary_flags: input.dietary_flags || [],
    health_goals: input.health_goals || [],
    meal_types: input.meal_types || [],
    schema_version: 2,
    quality_status: input.quality_status || "normalized",
  };
}
