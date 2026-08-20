import type { SupabaseClient } from "@supabase/supabase-js";
import { findMealConstraintIssues } from "@/lib/domain/menu-constraints";
import { normalizeIngredientName, normalizeRecipe } from "@/lib/domain/recipe-normalize";
import type { Dish, DishFeedbackSummary, Preferences, Recipe, RecipeCandidate } from "@/lib/types";

function recipeDish(recipe: Recipe): Dish {
  return {
    name: recipe.name,
    ingredients: recipe.ingredient_details || [],
    seasonings: recipe.seasonings || [],
    tags: recipe.tags || [],
    cooking_time_minutes: recipe.cooking_time_minutes,
  };
}

export function recipeViolatesHardConstraints(recipe: Recipe, prefs: Preferences, feedback?: DishFeedbackSummary) {
  if (recipe.quality_status === "deprecated") return true;
  if ((feedback?.blocked_dishes || []).some((name) => recipe.name.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(recipe.name.toLowerCase()))) return true;
  return findMealConstraintIssues({ name: recipe.name, calories: recipe.calories, dishes: [recipeDish(recipe)] }, prefs).length > 0;
}

function cuisineMatch(recipe: Recipe, cuisines?: string) {
  const wanted = (cuisines || "").split(/[、,，/\s]+/).map((item) => item.trim().toLowerCase()).filter(Boolean);
  if (!wanted.length) return false;
  const text = `${recipe.cuisine} ${(recipe.tags || []).join(" ")}`.toLowerCase();
  return wanted.some((item) => text.includes(item) || item.includes(recipe.cuisine.toLowerCase()));
}

function primaryIngredient(recipe: Recipe) {
  return (recipe.ingredient_details || []).find((item) => ["meat", "seafood", "egg_dairy", "soy"].includes(item.category))?.normalized_name
    || (recipe.ingredient_details || [])[0]?.normalized_name
    || normalizeIngredientName(recipe.name);
}

export function scoreRecipeCandidate(recipe: Recipe, prefs: Preferences, feedback?: DishFeedbackSummary): RecipeCandidate {
  let score = recipe.quality_status === "reviewed" ? 30 : recipe.quality_status === "normalized" ? 20 : 5;
  const reasons: string[] = [];
  if (recipe.quality_status === "reviewed") reasons.push("系统审核菜谱");
  if (cuisineMatch(recipe, prefs.cuisines)) { score += 18; reasons.push("符合菜系偏好"); }
  if (prefs.health_goal && recipe.health_goals?.includes(prefs.health_goal)) { score += 16; reasons.push("匹配健康目标"); }
  if (prefs.cooking_time_limit && recipe.cooking_time_minutes) {
    if (recipe.cooking_time_minutes <= prefs.cooking_time_limit) { score += 14; reasons.push(`可在 ${prefs.cooking_time_limit} 分钟内完成`); }
    else score -= Math.min(25, recipe.cooking_time_minutes - prefs.cooking_time_limit);
  }
  if (prefs.light_meal && (recipe.health_goals || []).some((goal) => ["fat_loss", "low_sugar", "balanced"].includes(goal))) {
    score += 8;
    reasons.push("偏清淡均衡");
  }
  if (prefs.special_group === "elderly" && (recipe.tags || []).some((tag) => /老人|软烂|清淡|蒸|粥/.test(tag))) {
    score += 8;
    reasons.push("做法适合长辈日常用餐");
  }
  if ((feedback?.liked_dishes || []).some((name) => recipe.name.includes(name) || name.includes(recipe.name))) {
    score += 12;
    reasons.push("与喜欢的菜品一致");
  }
  if ((feedback?.cooked_dishes || []).some((name) => recipe.name.includes(name) || name.includes(recipe.name))) {
    score += 4;
    reasons.push("属于熟悉做法");
  }
  if (recipe.source_recipe_id) score += 5;
  return { recipe, score, reasons: reasons.length ? reasons : ["可信菜谱库候选"], matched_ingredients: [] };
}

export function rankRecipeCandidates(
  recipes: Recipe[],
  prefs: Preferences,
  feedback?: DishFeedbackSummary,
  limit = 24
) {
  const ranked = recipes
    .filter((recipe) => !recipeViolatesHardConstraints(recipe, prefs, feedback))
    .map((recipe) => scoreRecipeCandidate(recipe, prefs, feedback))
    .sort((a, b) => b.score - a.score || a.recipe.name.localeCompare(b.recipe.name, "zh-CN"));

  const selected: RecipeCandidate[] = [];
  const primaryCounts = new Map<string, number>();
  const cuisineCounts = new Map<string, number>();
  for (const candidate of ranked) {
    const primary = primaryIngredient(candidate.recipe);
    const cuisine = candidate.recipe.cuisine || "未分类";
    if ((primaryCounts.get(primary) || 0) >= 2 || (cuisineCounts.get(cuisine) || 0) >= Math.max(4, Math.ceil(limit / 2))) continue;
    const reused = selected.flatMap((item) => item.recipe.ingredient_details || []).map((item) => item.normalized_name);
    const matches = (candidate.recipe.ingredient_details || []).map((item) => item.normalized_name).filter((name) => reused.includes(name));
    if (matches.length) {
      candidate.score += Math.min(6, matches.length * 2);
      candidate.matched_ingredients = Array.from(new Set(matches));
      candidate.reasons.push(`可复用食材：${candidate.matched_ingredients.slice(0, 3).join("、")}`);
    }
    selected.push(candidate);
    primaryCounts.set(primary, (primaryCounts.get(primary) || 0) + 1);
    cuisineCounts.set(cuisine, (cuisineCounts.get(cuisine) || 0) + 1);
    if (selected.length >= limit) break;
  }
  return selected;
}

export async function searchTrustedRecipes(
  supabase: SupabaseClient | null,
  prefs: Preferences,
  feedback?: DishFeedbackSummary,
  limit = 24
): Promise<RecipeCandidate[]> {
  if (!supabase) return [];
  try {
    let result = await supabase.from("recipes").select("*").eq("is_public", true).in("quality_status", ["normalized", "reviewed"]).limit(120);
    if (result.error) {
      const message = `${result.error.code || ""} ${result.error.message || ""}`.toLowerCase();
      if (!message.includes("quality_status") && !message.includes("schema cache") && !message.includes("42703")) return [];
      result = await supabase.from("recipes").select("*").eq("is_public", true).limit(120);
    }
    return rankRecipeCandidates((result.data || []).map(normalizeRecipe), prefs, feedback, limit);
  } catch (error) {
    console.warn(JSON.stringify({ scope: "recipe_candidate_retrieval", status: "fallback", error: error instanceof Error ? error.message : String(error) }));
    return [];
  }
}
