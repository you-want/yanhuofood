import type { z } from "zod";
import { generateMenuRequestSchema } from "@/lib/schemas/menu";
import type { MenuDays, Preferences } from "@/lib/types";

export type GenerateMenuRequest = z.infer<typeof generateMenuRequestSchema>;

export const MENU_GENERATION_DEFAULTS = {
  days: 7 as MenuDays,
  mealCount: 3,
  dishesPerMeal: 1,
  dinersCount: 1,
  cookingTimeLimit: 45,
} as const;

function compactStrings(values: string[] | undefined) {
  return Array.from(new Set((values || []).map((value) => value.trim()).filter(Boolean)));
}

function defined<T>(value: T | undefined, fallback: T): T {
  return value === undefined ? fallback : value;
}

export function resolveMenuGenerationPreferences(
  stored: Preferences | null | undefined,
  request: GenerateMenuRequest
): Preferences {
  return {
    cuisines: defined(request.cuisines, stored?.cuisines || "").trim(),
    dietary_restrictions: compactStrings(defined(request.dietary_restrictions, stored?.dietary_restrictions || [])),
    disliked_ingredients: compactStrings(defined(request.disliked_ingredients, stored?.disliked_ingredients || [])),
    halal: defined(request.halal, stored?.halal || false),
    light_meal: defined(request.light_meal, stored?.light_meal || false),
    special_group: defined(request.special_group, stored?.special_group ?? null),
    energy_display: defined(request.energy_display, stored?.energy_display || "auto"),
    days: defined(request.days, stored?.days || MENU_GENERATION_DEFAULTS.days),
    meal_count: defined(request.mealCount, stored?.meal_count || MENU_GENERATION_DEFAULTS.mealCount),
    diners_count: defined(request.diners_count, stored?.diners_count || MENU_GENERATION_DEFAULTS.dinersCount),
    dishes_per_meal: defined(request.dishes_per_meal, stored?.dishes_per_meal || MENU_GENERATION_DEFAULTS.dishesPerMeal),
    health_goal: defined(request.health_goal, stored?.health_goal || "balanced"),
    budget_level: defined(request.budget_level, stored?.budget_level || "medium"),
    cooking_time_limit: defined(request.cooking_time_limit, stored?.cooking_time_limit || MENU_GENERATION_DEFAULTS.cookingTimeLimit),
    scenario: defined(request.scenario, stored?.scenario || "daily_home"),
    festival_type: defined(request.festival_type, stored?.festival_type),
    festival_theme: defined(request.festival_theme, stored?.festival_theme)?.trim() || undefined,
  };
}

export function menuGenerationParameterSnapshot(prefs: Preferences, startDate: string) {
  return {
    start_date: startDate,
    days: prefs.days,
    meal_count: prefs.meal_count,
    dishes_per_meal: prefs.dishes_per_meal,
    diners_count: prefs.diners_count,
    cuisines: prefs.cuisines || "",
    dietary_restrictions: compactStrings(prefs.dietary_restrictions),
    disliked_ingredients: compactStrings(prefs.disliked_ingredients),
    halal: !!prefs.halal,
    light_meal: !!prefs.light_meal,
    special_group: prefs.special_group ?? null,
    energy_display: prefs.energy_display || "auto",
    health_goal: prefs.health_goal || "balanced",
    budget_level: prefs.budget_level || "medium",
    cooking_time_limit: prefs.cooking_time_limit || MENU_GENERATION_DEFAULTS.cookingTimeLimit,
    scenario: prefs.scenario || "daily_home",
    festival_type: prefs.festival_type,
    festival_theme: prefs.festival_theme,
  };
}
