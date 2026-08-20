import type { DishFeedbackEntry, DishFeedbackSummary, DishFeedbackValue } from "@/lib/types";

export const EMPTY_DISH_FEEDBACK_SUMMARY: DishFeedbackSummary = {
  liked_dishes: [],
  blocked_dishes: [],
  cooked_dishes: [],
};

export function normalizeDishFeedbackName(name: string) {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function uniqueDishNames(names: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const name of names) {
    const trimmed = name.trim();
    const key = normalizeDishFeedbackName(trimmed);
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed.slice(0, 80));
  }
  return result.slice(0, 20);
}

export function buildDishFeedbackSummary(entries: DishFeedbackEntry[]): DishFeedbackSummary {
  return {
    liked_dishes: uniqueDishNames(entries.filter((entry) => entry.liked && !entry.blocked).map((entry) => entry.dish_name)),
    blocked_dishes: uniqueDishNames(entries.filter((entry) => entry.blocked).map((entry) => entry.dish_name)),
    cooked_dishes: uniqueDishNames(entries.filter((entry) => entry.cooked && !entry.blocked).map((entry) => entry.dish_name)),
  };
}

export function mergeDishFeedbackSummaries(...summaries: Array<DishFeedbackSummary | undefined | null>): DishFeedbackSummary {
  const blocked = new Set<string>();
  const liked: string[] = [];
  const cooked: string[] = [];

  for (const summary of summaries) {
    for (const name of summary?.blocked_dishes || []) {
      blocked.add(normalizeDishFeedbackName(name));
    }
  }

  for (const summary of summaries) {
    for (const name of summary?.liked_dishes || []) {
      if (!blocked.has(normalizeDishFeedbackName(name))) liked.push(name);
    }
    for (const name of summary?.cooked_dishes || []) {
      if (!blocked.has(normalizeDishFeedbackName(name))) cooked.push(name);
    }
  }

  return {
    liked_dishes: uniqueDishNames(liked),
    blocked_dishes: uniqueDishNames(summaries.flatMap((summary) => summary?.blocked_dishes || [])),
    cooked_dishes: uniqueDishNames(cooked),
  };
}

export function mergeDishFeedbackEntries(...groups: Array<DishFeedbackEntry[] | undefined | null>) {
  const byKey = new Map<string, DishFeedbackEntry>();
  for (const entries of groups) {
    for (const entry of entries || []) {
      const key = entry.dish_key || normalizeDishFeedbackName(entry.dish_name);
      if (!key) continue;
      byKey.set(key, { ...byKey.get(key), ...entry, dish_key: key });
    }
  }
  return Array.from(byKey.values());
}

export function applyDishFeedbackEntry(
  entries: DishFeedbackEntry[],
  input: {
    dish_name: string;
    feedback: DishFeedbackValue;
    active: boolean;
    source_menu_start?: string | null;
  }
) {
  const dishName = input.dish_name.trim().slice(0, 120);
  const dishKey = normalizeDishFeedbackName(dishName);
  const byKey = new Map(entries.map((entry) => [entry.dish_key || normalizeDishFeedbackName(entry.dish_name), entry]));
  const current = byKey.get(dishKey) || { dish_name: dishName, dish_key: dishKey };
  const next: DishFeedbackEntry = {
    ...current,
    dish_name: current.dish_name || dishName,
    dish_key: dishKey,
    source_menu_start: input.source_menu_start ?? current.source_menu_start ?? null,
    updated_at: new Date().toISOString(),
  };

  if (input.feedback === "liked") {
    next.liked = input.active;
    if (input.active) next.blocked = false;
  } else if (input.feedback === "blocked") {
    next.blocked = input.active;
    if (input.active) next.liked = false;
  } else {
    next.cooked = input.active;
  }

  byKey.set(dishKey, next);
  return Array.from(byKey.values()).filter((entry) => entry.liked || entry.blocked || entry.cooked);
}
