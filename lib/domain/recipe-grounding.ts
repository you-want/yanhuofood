import { normalizeMenu } from "@/lib/domain/menu";
import type { Dish, IngredientUsage, Menu, Recipe, RecipeCandidate, RecipeEvidence } from "@/lib/types";

function scaleIngredient(item: IngredientUsage, multiplier: number): IngredientUsage {
  return {
    ...item,
    amount: typeof item.amount === "number" ? Math.round(item.amount * multiplier * 10) / 10 : item.amount,
  };
}

function evidenceFor(candidate: RecipeCandidate): RecipeEvidence {
  const recipe = candidate.recipe;
  return {
    source_recipe_id: recipe.source_recipe_id || recipe.id,
    source_name: recipe.source?.name || "烟火食间可信菜谱库",
    source_url: recipe.source_url || null,
    reasons: candidate.reasons,
    score: candidate.score,
    quality_status: recipe.quality_status,
  };
}

export function recipeToGroundedDish(recipe: Recipe, dinersCount: number, candidate?: RecipeCandidate, adaptationNote?: string): Dish {
  const baseServings = recipe.servings && recipe.servings > 0 ? recipe.servings : dinersCount;
  const multiplier = dinersCount / baseServings;
  return {
    id: recipe.id,
    name: recipe.name,
    ingredients: (recipe.ingredient_details || []).map((item) => scaleIngredient(item, multiplier)),
    seasonings: (recipe.seasonings || []).map((item) => scaleIngredient(item, multiplier)),
    steps: (recipe.steps || []).map((step) => step.instruction),
    calories: recipe.calories,
    nutrition: recipe.nutrition,
    cooking_time_minutes: recipe.cooking_time_minutes,
    difficulty: recipe.difficulty,
    tags: recipe.tags || [],
    source_kind: "trusted",
    source_recipe_id: recipe.source_recipe_id || recipe.id,
    source_url: recipe.source_url,
    source_name: recipe.source?.name || "烟火食间可信菜谱库",
    evidence: candidate ? evidenceFor(candidate) : undefined,
    servings: dinersCount,
    adaptation_note: adaptationNote,
  };
}

export function hydrateMenuWithTrustedRecipes(menu: Menu, candidates: RecipeCandidate[], dinersCount: number) {
  const byId = new Map<string, RecipeCandidate>();
  const byName = new Map<string, RecipeCandidate>();
  for (const candidate of candidates) {
    byId.set(candidate.recipe.source_recipe_id || candidate.recipe.id, candidate);
    byName.set(candidate.recipe.name.trim().toLowerCase(), candidate);
  }
  let groundedCount = 0;
  let generatedCount = 0;
  const hydrated = normalizeMenu({
    ...menu,
    days: menu.days.map((day) => ({
      ...day,
      meals: day.meals.map((meal) => ({
        ...meal,
        dishes: (meal.dishes || []).map((dish) => {
          const candidate = dish.source_recipe_id ? byId.get(dish.source_recipe_id) : byName.get(dish.name.trim().toLowerCase());
          if (!candidate) {
            generatedCount += 1;
            return { ...dish, source_kind: "generated" as const };
          }
          groundedCount += 1;
          return recipeToGroundedDish(candidate.recipe, dinersCount, candidate, dish.adaptation_note);
        }),
      })),
    })),
  });
  return { menu: hydrated, groundedCount, generatedCount };
}

export function compactRecipeCandidates(candidates: RecipeCandidate[], limit = 24) {
  return candidates.slice(0, limit).map((candidate) => ({
    source_recipe_id: candidate.recipe.source_recipe_id || candidate.recipe.id,
    name: candidate.recipe.name,
    cuisine: candidate.recipe.cuisine,
    meal_types: candidate.recipe.meal_types || [],
    cooking_time_minutes: candidate.recipe.cooking_time_minutes,
    difficulty: candidate.recipe.difficulty,
    ingredients: (candidate.recipe.ingredient_details || []).slice(0, 6).map((item) => item.normalized_name),
    health_goals: candidate.recipe.health_goals || [],
    score: candidate.score,
    reasons: candidate.reasons.slice(0, 3),
  }));
}
