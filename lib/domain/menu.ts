import type { Day, Dish, Meal, Menu, NutritionSummary } from "@/lib/types";

export const DAY_ORDER = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function parseIsoDate(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function addDaysToDate(date: string, days: number): string {
  const d = parseIsoDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function getDayCodeForDate(date: string): string {
  return DAY_ORDER[parseIsoDate(date).getUTCDay()];
}

function sumNutrition(items: Array<NutritionSummary | undefined>): NutritionSummary | undefined {
  const total: NutritionSummary = {};
  for (const item of items) {
    if (!item) continue;
    total.calories = (total.calories ?? 0) + (item.calories ?? 0);
    total.protein_g = (total.protein_g ?? 0) + (item.protein_g ?? 0);
    total.fat_g = (total.fat_g ?? 0) + (item.fat_g ?? 0);
    total.carbs_g = (total.carbs_g ?? 0) + (item.carbs_g ?? 0);
    total.fiber_g = (total.fiber_g ?? 0) + (item.fiber_g ?? 0);
    total.sodium_mg = (total.sodium_mg ?? 0) + (item.sodium_mg ?? 0);
  }
  return Object.keys(total).length > 0 ? total : undefined;
}

function normalizeDish(dish: Partial<Dish>, fallbackIndex: number): Dish {
  return {
    id: dish.id || `dish-${fallbackIndex}`,
    name: dish.name || "未命名菜品",
    ingredients: dish.ingredients || [],
    seasonings: dish.seasonings || [],
    steps: dish.steps || [],
    calories: dish.calories ?? dish.nutrition?.calories,
    nutrition: dish.nutrition,
    cooking_time_minutes: dish.cooking_time_minutes,
    difficulty: dish.difficulty,
    tags: dish.tags || [],
    source_kind: dish.source_kind,
    source_recipe_id: dish.source_recipe_id,
    source_url: dish.source_url,
    source_name: dish.source_name,
    evidence: dish.evidence,
    servings: dish.servings,
    adaptation_note: dish.adaptation_note,
  };
}

export function getMealName(meal: Partial<Meal> | undefined): string {
  if (!meal) return "";
  if (meal.name) return meal.name;
  if (meal.title) return meal.title;
  const dishNames = meal.dishes?.map((dish) => dish.name).filter(Boolean);
  return dishNames?.length ? dishNames.join("、") : "";
}

export function getMealCalories(meal: Partial<Meal> | undefined): number {
  if (!meal) return 0;
  if (typeof meal.calories === "number") return meal.calories;
  if (typeof meal.nutrition?.calories === "number") return meal.nutrition.calories;
  return Math.round(
    meal.dishes?.reduce((sum, dish) => sum + (dish.calories ?? dish.nutrition?.calories ?? 0), 0) ?? 0
  );
}

export function normalizeMeal(meal: Partial<Meal>, index: number): Meal {
  const dishes = meal.dishes?.length
    ? meal.dishes.map((dish, dishIndex) => normalizeDish(dish, dishIndex))
    : getMealName(meal)
        .split("、")
        .map((name) => name.trim())
        .filter(Boolean)
        .map((name, dishIndex) => normalizeDish({ name, calories: dishIndex === 0 ? meal.calories : undefined }, dishIndex));

  const nutrition = meal.nutrition || sumNutrition(dishes.map((dish) => dish.nutrition || { calories: dish.calories }));

  return {
    id: meal.id || `meal-${index}`,
    type: meal.type,
    title: meal.title || getMealName({ ...meal, dishes }),
    dishes,
    name: getMealName({ ...meal, dishes }),
    calories: getMealCalories({ ...meal, dishes, nutrition }),
    nutrition,
    reason: meal.reason,
    warnings: meal.warnings || [],
  };
}

export function normalizeDay(day: Partial<Day>, index: number, fallbackDate?: string): Day {
  const meals = (day.meals || []).map((meal, mealIndex) => normalizeMeal(meal, mealIndex));
  return {
    date: day.date || fallbackDate,
    day: day.day || (fallbackDate ? getDayCodeForDate(fallbackDate) : DAY_ORDER[(index + 1) % 7] || `Day ${index + 1}`),
    meals,
    nutrition: day.nutrition || sumNutrition(meals.map((meal) => meal.nutrition || { calories: meal.calories })),
  };
}

export function getMenuStartDate(menu: Partial<Menu>): string {
  return menu.start_date || menu.week_start || new Date().toISOString().slice(0, 10);
}

export function getMenuEndDate(menu: Partial<Menu>): string {
  if (menu.end_date) return menu.end_date;
  const start = new Date(getMenuStartDate(menu));
  const dayCount = menu.days?.length || 1;
  start.setDate(start.getDate() + dayCount - 1);
  return start.toISOString().slice(0, 10);
}

export function normalizeMenu(input: Partial<Menu>): Menu {
  const startDate = getMenuStartDate(input);
  const days = (input.days || []).map((day, dayIndex) => normalizeDay(day, dayIndex, addDaysToDate(startDate, dayIndex)));
  const periodType = input.period_type || (days.length === 1 ? "day" : "week");

  return {
    week_start: input.week_start || startDate,
    period_type: periodType,
    start_date: startDate,
    end_date: input.end_date || getMenuEndDate({ ...input, start_date: startDate, days }),
    days,
    summary: input.summary || sumNutrition(days.map((day) => day.nutrition)),
    schema_version: input.schema_version || 2,
  };
}
