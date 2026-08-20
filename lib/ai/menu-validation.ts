import { ZodError } from "zod";
import { addDaysToDate, getDayCodeForDate, normalizeMenu } from "@/lib/domain/menu";
import { findMenuConstraintIssues } from "@/lib/domain/menu-constraints";
import { menuSchema } from "@/lib/schemas/menu";
import type { Menu, MenuDays, Preferences } from "@/lib/types";

export type MenuGenerationErrorType =
  | "no_json"
  | "json_parse_error"
  | "truncated_output"
  | "schema_error"
  | "date_mismatch"
  | "meal_count_mismatch"
  | "constraint_violation"
  | "unknown";

export interface MenuValidationOptions {
  startDate: string;
  mealCount: number;
  daysCount: MenuDays;
  dishesPerMeal: number;
  allowSyntheticMeals?: boolean;
  preferences?: Preferences;
}

export interface MenuValidationResult {
  menu: Menu;
  warnings: string[];
}

export class MenuGenerationValidationError extends Error {
  errorType: MenuGenerationErrorType;

  constructor(message: string, errorType: MenuGenerationErrorType) {
    super(message);
    this.name = "MenuGenerationValidationError";
    this.errorType = errorType;
  }
}

const EXTRA_DISHES_POOL = ["清炒时蔬", "西红柿蛋汤", "凉拌黄瓜", "菌菇小炒", "海带丝", "蒸南瓜", "玉米粒", "炒青菜", "清炒菠菜"];

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function composeMultiDish(name: string, count: number): string {
  if (count <= 1) return name;
  const existingDishCount = name.split("、").map((item) => item.trim()).filter(Boolean).length;
  if (existingDishCount >= count) return name;
  const picks: string[] = [];
  for (let i = 0; i < count - existingDishCount; i++) {
    picks.push(EXTRA_DISHES_POOL[(i + name.length) % EXTRA_DISHES_POOL.length]);
  }
  return [name, ...picks].join("、");
}

function syntheticMeal(index: number, mealCount: number) {
  const isLast = index === mealCount - 1;
  const name = index % 2 === 0 ? "水果拼盘" : "酸奶";
  return {
    type: index === 0 ? "breakfast" as const : isLast ? "dinner" as const : "snack" as const,
    name,
    calories: 150,
    dishes: [{ name, calories: 150, ingredients: [], tags: ["加餐"] }],
  };
}

function classifySchemaIssue(error: ZodError): MenuGenerationErrorType {
  const paths = error.issues.map((issue) => issue.path.join("."));
  if (paths.some((path) => path.includes("days") && path.includes("meals"))) return "meal_count_mismatch";
  if (paths.some((path) => path.includes("date") || path.includes("day") || path.includes("start_date") || path.includes("week_start"))) {
    return "date_mismatch";
  }
  return "schema_error";
}

export function parseMenuJson(text: string): unknown {
  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}") + 1;
  if (jsonStart < 0 || jsonEnd <= jsonStart) {
    throw new MenuGenerationValidationError(
      "AI response did not contain a JSON object",
      jsonStart >= 0 && jsonEnd <= jsonStart ? "truncated_output" : "no_json"
    );
  }

  try {
    return JSON.parse(text.slice(jsonStart, jsonEnd));
  } catch (error) {
    const message = errorMessage(error).toLowerCase();
    throw new MenuGenerationValidationError(
      errorMessage(error),
      message.includes("unexpected end") || message.includes("unterminated") ? "truncated_output" : "json_parse_error"
    );
  }
}

export function classifyMenuGenerationError(error: unknown, rawText: string): MenuGenerationErrorType {
  if (error instanceof MenuGenerationValidationError) return error.errorType;
  if (error instanceof ZodError) return classifySchemaIssue(error);

  const message = errorMessage(error).toLowerCase();
  const trimmed = rawText.trim();
  const hasJsonStart = trimmed.includes("{");
  const hasJsonEnd = trimmed.includes("}");

  if (!hasJsonStart || !hasJsonEnd) {
    return hasJsonStart && !hasJsonEnd ? "truncated_output" : "no_json";
  }
  if (message.includes("unexpected end") || message.includes("unterminated")) return "truncated_output";
  if (error instanceof SyntaxError || message.includes("json") || message.includes("unexpected token")) return "json_parse_error";
  if (message.includes("date") || message.includes("day") || message.includes("start_date") || message.includes("week_start")) return "date_mismatch";
  if (message.includes("meal") || message.includes("餐")) return "meal_count_mismatch";
  if (message.includes("zod") || message.includes("invalid") || message.includes("expected") || message.includes("required")) return "schema_error";
  return "unknown";
}

export function normalizeGeneratedMenu(menu: Menu, options: MenuValidationOptions): MenuValidationResult {
  const warnings: string[] = [];
  const next = normalizeMenu(JSON.parse(JSON.stringify(menu)) as Menu);

  if (next.start_date !== options.startDate || next.week_start !== options.startDate) {
    warnings.push("已本地修正菜单开始日期。");
  }
  next.start_date = options.startDate;
  next.week_start = options.startDate;

  const expectedEndDate = addDaysToDate(options.startDate, options.daysCount - 1);
  if (next.end_date !== expectedEndDate) {
    warnings.push("已本地修正菜单结束日期。");
  }
  next.end_date = expectedEndDate;
  next.period_type = options.daysCount === 1 ? "day" : "week";
  next.schema_version = next.schema_version || 2;

  if (next.days.length < options.daysCount) {
    throw new MenuGenerationValidationError(
      `Menu has ${next.days.length} days, expected ${options.daysCount}`,
      "date_mismatch"
    );
  }
  if (next.days.length > options.daysCount) {
    warnings.push("已本地裁剪多余日期。");
  }

  next.days = next.days.slice(0, options.daysCount).map((day, dayIndex) => {
    const expectedDate = addDaysToDate(options.startDate, dayIndex);
    const expectedDay = getDayCodeForDate(expectedDate);

    if (day.date !== expectedDate || day.day !== expectedDay) {
      warnings.push(`已本地修正第 ${dayIndex + 1} 天日期和星期。`);
    }
    if (day.meals.length < options.mealCount && !options.allowSyntheticMeals) {
      throw new MenuGenerationValidationError(
        `Day ${dayIndex + 1} has ${day.meals.length} meals, expected ${options.mealCount}`,
        "meal_count_mismatch"
      );
    }
    if (day.meals.length < options.mealCount) {
      warnings.push(`已本地补齐第 ${dayIndex + 1} 天缺失餐次。`);
    }
    if (day.meals.length > options.mealCount) {
      warnings.push(`已本地裁剪第 ${dayIndex + 1} 天多余餐次。`);
    }

    return {
      ...day,
      date: expectedDate,
      day: expectedDay,
      meals: [...day.meals, ...Array.from({ length: Math.max(0, options.mealCount - day.meals.length) }, (_, index) => syntheticMeal(day.meals.length + index, options.mealCount))]
        .slice(0, options.mealCount)
        .map((meal) => ({
        ...meal,
        name: composeMultiDish(meal.name, options.dishesPerMeal),
      })),
    };
  });

  const normalizedMenu = normalizeMenu(next);
  if (options.preferences) {
    const issues = findMenuConstraintIssues(normalizedMenu, options.preferences);
    if (issues.length) {
      throw new MenuGenerationValidationError(
        `Menu violates hard constraints: ${issues.slice(0, 5).map((issue) => issue.message).join("；")}`,
        "constraint_violation"
      );
    }
  }
  return {
    menu: normalizedMenu,
    warnings: Array.from(new Set(warnings)),
  };
}

export function validateGeneratedMenu(text: string, options: MenuValidationOptions): MenuValidationResult {
  const parsed = parseMenuJson(text);
  const validated = menuSchema.parse(parsed);
  return normalizeGeneratedMenu(normalizeMenu(validated), options);
}
