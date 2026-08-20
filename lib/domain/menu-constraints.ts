import { getMealName } from "@/lib/domain/menu";
import type { Dish, Meal, Menu, Preferences } from "@/lib/types";

export interface MenuConstraintIssue {
  date?: string;
  mealIndex?: number;
  dishIndex?: number;
  type: "disliked_ingredient" | "halal" | "dietary_restriction";
  keyword: string;
  message: string;
}

const HALAL_BLOCKED_KEYWORDS = ["猪", "五花肉", "培根", "火腿", "香肠", "腊肉", "酒", "料酒", "黄酒", "啤酒", "红酒"];
const LOW_OIL_KEYWORDS = ["油炸", "炸", "酥炸", "干锅", "红油"];
const LOW_SALT_KEYWORDS = ["咸菜", "腌菜", "腊肉", "火腿", "酱菜"];
const LOW_SUGAR_KEYWORDS = ["糖醋", "甜", "蜜汁", "糖水"];

function includesKeyword(text: string, keyword: string) {
  return text.toLowerCase().includes(keyword.toLowerCase());
}

function dishText(dish: Dish) {
  return [
    dish.name,
    ...(dish.ingredients || []).map((item) => item.name),
    ...(dish.seasonings || []).map((item) => item.name),
    ...(dish.tags || []),
  ].join(" ");
}

function mealText(meal: Meal) {
  return [
    getMealName(meal),
    ...(meal.dishes || []).map(dishText),
  ].join(" ");
}

function restrictionKeywords(restrictions: string[]) {
  const keywords: Array<{ type: MenuConstraintIssue["type"]; keyword: string; label: string }> = [];
  for (const restriction of restrictions) {
    if (includesKeyword(restriction, "少油") || includesKeyword(restriction, "低脂")) {
      LOW_OIL_KEYWORDS.forEach((keyword) => keywords.push({ type: "dietary_restriction", keyword, label: "少油/低脂" }));
    }
    if (includesKeyword(restriction, "少盐") || includesKeyword(restriction, "低钠")) {
      LOW_SALT_KEYWORDS.forEach((keyword) => keywords.push({ type: "dietary_restriction", keyword, label: "少盐/低钠" }));
    }
    if (includesKeyword(restriction, "控糖") || includesKeyword(restriction, "低糖")) {
      LOW_SUGAR_KEYWORDS.forEach((keyword) => keywords.push({ type: "dietary_restriction", keyword, label: "控糖/低糖" }));
    }
  }
  return keywords;
}

export function findMealConstraintIssues(meal: Meal, prefs: Preferences, context: { date?: string; mealIndex?: number } = {}) {
  const issues: MenuConstraintIssue[] = [];
  const text = mealText(meal);

  for (const keyword of prefs.disliked_ingredients || []) {
    const normalized = keyword.trim();
    if (normalized && includesKeyword(text, normalized)) {
      issues.push({
        ...context,
        type: "disliked_ingredient",
        keyword: normalized,
        message: `包含忌口「${normalized}」`,
      });
    }
  }

  if (prefs.halal) {
    for (const keyword of HALAL_BLOCKED_KEYWORDS) {
      if (includesKeyword(text, keyword)) {
        issues.push({
          ...context,
          type: "halal",
          keyword,
          message: `清真限制冲突：${keyword}`,
        });
      }
    }
  }

  for (const item of restrictionKeywords(prefs.dietary_restrictions || [])) {
    if (includesKeyword(text, item.keyword)) {
      issues.push({
        ...context,
        type: item.type,
        keyword: item.keyword,
        message: `${item.label}限制可能冲突：${item.keyword}`,
      });
    }
  }

  return issues;
}

export function findMenuConstraintIssues(menu: Menu, prefs: Preferences) {
  return menu.days.flatMap((day) =>
    day.meals.flatMap((meal, mealIndex) =>
      findMealConstraintIssues(meal, prefs, { date: day.date, mealIndex })
    )
  );
}
