import OpenAI from "openai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { writeProductEvent } from "@/lib/analytics/product-events";
import { modelCompatibilityOptions } from "@/lib/ai/model-compatibility";
import { findMealConstraintIssues } from "@/lib/domain/menu-constraints";
import { getMealCalories, getMealName, getMenuStartDate, normalizeMenu } from "@/lib/domain/menu";
import { dishSchema, localModelConfigSchema, mealSchema, menuSchema } from "@/lib/schemas/menu";
import { supabaseServer } from "@/lib/supabase";
import type { Dish, Meal, Menu, Preferences } from "@/lib/types";
import { ensureClientId } from "@/lib/user";
import { getHostedAccess, hostedAccessResponse, usesLocalModelConfig } from "@/lib/supabase-auth";

const replacementReasonSchema = z.enum(["dislike", "hard_to_buy", "too_complex", "too_expensive", "repeated", "other"]);
const replaceScopeSchema = z.enum(["meal", "dish"]);

const replaceMealRequestSchema = z.object({
  menu: menuSchema,
  target: z.object({
    dayIndex: z.coerce.number().int().min(0),
    mealIndex: z.coerce.number().int().min(0),
    dishIndex: z.coerce.number().int().min(0).optional(),
  }),
  scope: replaceScopeSchema,
  reason: replacementReasonSchema,
  preferences: z.object({
    cuisines: z.string().optional(),
    dietary_restrictions: z.array(z.string()).default([]),
    disliked_ingredients: z.array(z.string()).default([]),
    halal: z.boolean().default(false),
    light_meal: z.boolean().default(false),
    special_group: z.enum(["children", "elderly", "pregnant"]).nullable().optional(),
    energy_display: z.enum(["auto", "on", "off"]).optional(),
    days: z.union([z.literal(1), z.literal(5), z.literal(7)]).optional(),
    meal_count: z.coerce.number().int().min(1).max(6).optional(),
    diners_count: z.coerce.number().int().min(1).max(20).optional(),
    dishes_per_meal: z.coerce.number().int().min(1).max(6).optional(),
    health_goal: z.enum(["balanced", "fat_loss", "high_protein", "low_sugar", "muscle_gain"]).optional(),
    budget_level: z.enum(["low", "medium", "high"]).optional(),
    cooking_time_limit: z.coerce.number().int().positive().optional(),
  }).default({
    dietary_restrictions: [],
    disliked_ingredients: [],
    halal: false,
    light_meal: false,
  }),
  model_config: localModelConfigSchema.optional(),
});

const REASON_LABELS: Record<z.infer<typeof replacementReasonSchema>, string> = {
  dislike: "不爱吃",
  hard_to_buy: "食材难买",
  too_complex: "太复杂",
  too_expensive: "太贵",
  repeated: "重复",
  other: "其他",
};

const REPLACEMENT_TIMEOUT_MS = 30_000;

const FALLBACK_DISHES: Dish[] = [
  {
    name: "番茄鸡蛋",
    ingredients: [
      { name: "番茄", amount: 2, unit: "个", category: "vegetable" },
      { name: "鸡蛋", amount: 2, unit: "个", category: "egg_dairy" },
    ],
    seasonings: [{ name: "盐", unit: "适量", category: "seasoning" }],
    steps: ["番茄切块，鸡蛋炒定型后合炒调味。"],
    calories: 280,
    nutrition: { calories: 280, protein_g: 16, fat_g: 16, carbs_g: 18 },
    cooking_time_minutes: 15,
    difficulty: "easy",
    tags: ["家常", "快手"],
  },
  {
    name: "香菇青菜",
    ingredients: [
      { name: "青菜", amount: 300, unit: "g", category: "vegetable" },
      { name: "香菇", amount: 120, unit: "g", category: "vegetable" },
    ],
    seasonings: [{ name: "盐", unit: "适量", category: "seasoning" }],
    steps: ["香菇先炒出香味，加入青菜快炒至断生。"],
    calories: 160,
    nutrition: { calories: 160, protein_g: 8, fat_g: 7, carbs_g: 18 },
    cooking_time_minutes: 12,
    difficulty: "easy",
    tags: ["蔬菜", "清淡"],
  },
  {
    name: "鸡胸肉炒西兰花",
    ingredients: [
      { name: "鸡胸肉", amount: 180, unit: "g", category: "meat" },
      { name: "西兰花", amount: 250, unit: "g", category: "vegetable" },
    ],
    seasonings: [{ name: "黑胡椒", unit: "适量", category: "seasoning" }],
    steps: ["鸡胸肉切片煎熟，西兰花焯水后合炒。"],
    calories: 360,
    nutrition: { calories: 360, protein_g: 42, fat_g: 10, carbs_g: 22 },
    cooking_time_minutes: 20,
    difficulty: "easy",
    tags: ["高蛋白", "减脂"],
  },
];

function clientIdCookie(clientId: string) {
  return `client_id=${clientId}; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 365}`;
}

function cleanConfigValue(value: string | undefined) {
  const trimmed = value?.trim() || "";
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function mealTypeLabel(type?: string) {
  if (type === "breakfast") return "早餐";
  if (type === "lunch") return "午餐";
  if (type === "dinner") return "晚餐";
  return "加餐";
}

function mealSummary(menu: Menu) {
  return menu.days.flatMap((day, dayIndex) =>
    day.meals.map((meal, mealIndex) => ({
      dayIndex,
      mealIndex,
      date: day.date,
      type: meal.type,
      name: getMealName(meal),
    }))
  );
}

function sumMealNutrition(dishes: Dish[]) {
  const calories = Math.round(dishes.reduce((sum, dish) => sum + (dish.calories ?? dish.nutrition?.calories ?? 0), 0));
  const protein = dishes.reduce((sum, dish) => sum + (dish.nutrition?.protein_g ?? 0), 0);
  const fat = dishes.reduce((sum, dish) => sum + (dish.nutrition?.fat_g ?? 0), 0);
  const carbs = dishes.reduce((sum, dish) => sum + (dish.nutrition?.carbs_g ?? 0), 0);
  return {
    calories,
    protein_g: protein ? Math.round(protein) : undefined,
    fat_g: fat ? Math.round(fat) : undefined,
    carbs_g: carbs ? Math.round(carbs) : undefined,
  };
}

function mealFromDishes(baseMeal: Meal, dishes: Dish[], reason: string): Meal {
  const nutrition = sumMealNutrition(dishes);
  return mealSchema.parse({
    ...baseMeal,
    name: dishes.map((dish) => dish.name).join("、"),
    title: baseMeal.title || mealTypeLabel(baseMeal.type),
    dishes,
    calories: nutrition.calories || getMealCalories(baseMeal),
    nutrition,
    reason,
    warnings: [],
  });
}

function fallbackDish(originalNames: string[], prefs: Preferences) {
  const blocked = new Set([...(prefs.disliked_ingredients || []), ...originalNames].map((item) => item.trim()).filter(Boolean));
  return FALLBACK_DISHES.find((dish) => !Array.from(blocked).some((keyword) => dish.name.includes(keyword))) || FALLBACK_DISHES[0];
}

function promptForReplacement(input: {
  menu: Menu;
  targetMeal: Meal;
  targetDate?: string;
  scope: "meal" | "dish";
  dish?: Dish;
  reason: string;
  prefs: Preferences;
}) {
  const targetName = input.scope === "dish" && input.dish ? input.dish.name : getMealName(input.targetMeal);
  const outputShape = input.scope === "dish" ? "只输出一个 dish JSON 对象" : "只输出一个 meal JSON 对象";
  return `你是一个谨慎的日常菜单调整助手。请替换用户不满意的${input.scope === "dish" ? "菜品" : "整餐"}。

目标日期：${input.targetDate || "未提供"}
目标餐次：${mealTypeLabel(input.targetMeal.type)}
要替换的内容：${targetName}
替换原因：${input.reason}

当前菜单摘要：
${JSON.stringify(mealSummary(input.menu).slice(0, 80))}

用户约束：
- 菜系/口味：${input.prefs.cuisines || "中式家常"}
- 饮食限制：${(input.prefs.dietary_restrictions || []).join("、") || "无"}
- 忌口：${(input.prefs.disliked_ingredients || []).join("、") || "无"}
- 清真：${input.prefs.halal ? "是，不能包含猪肉、酒精、料酒等" : "否"}
- 健康目标：${input.prefs.health_goal || "balanced"}
- 用餐人数：${input.prefs.diners_count || 1}
- 单餐烹饪时间上限：${input.prefs.cooking_time_limit || 45} 分钟

要求：
- 新内容不能与原内容同名，也避免和当前菜单摘要中的其他餐重复
- 必须给出结构化 ingredients、seasonings、steps、calories、nutrition、cooking_time_minutes、difficulty、tags
- ingredients 最多 5 个，seasonings 最多 3 个，steps 2 到 4 条，每条不超过 35 个中文字
- category 只能是 grain, meat, seafood, egg_dairy, vegetable, fruit, soy, seasoning, other
- difficulty 只能是 easy, medium, hard
- ${outputShape}，不要 markdown，不要解释。`;
}

function parseJsonObject(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}") + 1;
  if (start < 0 || end <= start) throw new Error("AI 未返回 JSON 对象");
  return JSON.parse(text.slice(start, end));
}

async function generateReplacement(input: {
  menu: Menu;
  targetMeal: Meal;
  targetDate?: string;
  scope: "meal" | "dish";
  dish?: Dish;
  reason: string;
  prefs: Preferences;
  modelConfig?: z.infer<typeof localModelConfigSchema>;
}) {
  const clientApiKey = input.modelConfig?.enabled ? cleanConfigValue(input.modelConfig.api_key) : "";
  const apiKey = clientApiKey || cleanConfigValue(process.env.OPENAI_API_KEY);
  const model = input.modelConfig?.enabled ? cleanConfigValue(input.modelConfig.model) : cleanConfigValue(process.env.OPENAI_MODEL) || "gpt-4o-mini";
  const baseURL = input.modelConfig?.enabled && input.modelConfig.base_url ? cleanConfigValue(input.modelConfig.base_url) : cleanConfigValue(process.env.OPENAI_BASE_URL);

  if (!apiKey) {
    const replacement = fallbackDish(input.targetMeal.dishes?.map((dish) => dish.name) || [], input.prefs);
    if (input.scope === "dish") return { source: "sample" as const, dish: replacement };
    return { source: "sample" as const, meal: mealFromDishes(input.targetMeal, [replacement], "模型未配置，使用本地替换菜品。") };
  }

  const openai = new OpenAI({ apiKey, baseURL });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REPLACEMENT_TIMEOUT_MS);
  try {
    const completion = await openai.chat.completions.create({
      model,
      messages: [{ role: "user", content: promptForReplacement(input) }],
      temperature: 0.35,
      max_tokens: input.scope === "dish" ? 1400 : 2200,
      ...modelCompatibilityOptions(model),
    }, { signal: controller.signal });
    const raw = completion.choices[0]?.message?.content?.trim() || "";
    const parsed = parseJsonObject(raw);
    if (input.scope === "dish") return { source: "ai" as const, dish: dishSchema.parse(parsed) };
    return { source: "ai" as const, meal: mealSchema.parse(parsed) };
  } catch (error) {
    if (!controller.signal.aborted) throw error;
    const replacement = fallbackDish(input.targetMeal.dishes?.map((dish) => dish.name) || [], input.prefs);
    if (input.scope === "dish") return { source: "sample" as const, dish: replacement };
    return { source: "sample" as const, meal: mealFromDishes(input.targetMeal, [replacement], "AI 替换超时，已使用本地替换菜品。") };
  } finally {
    clearTimeout(timeout);
  }
}

function assertOnlyTargetChanged(original: Menu, updated: Menu, target: { dayIndex: number; mealIndex: number; dishIndex?: number }, scope: "meal" | "dish") {
  const before = JSON.parse(JSON.stringify(original));
  const after = JSON.parse(JSON.stringify(updated));
  if (scope === "meal") {
    before.days[target.dayIndex].meals[target.mealIndex] = "__TARGET__";
    after.days[target.dayIndex].meals[target.mealIndex] = "__TARGET__";
  } else {
    before.days[target.dayIndex].meals[target.mealIndex].dishes[target.dishIndex ?? 0] = "__TARGET__";
    after.days[target.dayIndex].meals[target.mealIndex].dishes[target.dishIndex ?? 0] = "__TARGET__";
    before.days[target.dayIndex].meals[target.mealIndex].name = "__TARGET_MEAL_NAME__";
    after.days[target.dayIndex].meals[target.mealIndex].name = "__TARGET_MEAL_NAME__";
    before.days[target.dayIndex].meals[target.mealIndex].title = "__TARGET_MEAL_TITLE__";
    after.days[target.dayIndex].meals[target.mealIndex].title = "__TARGET_MEAL_TITLE__";
    before.days[target.dayIndex].meals[target.mealIndex].calories = "__TARGET_CALORIES__";
    after.days[target.dayIndex].meals[target.mealIndex].calories = "__TARGET_CALORIES__";
    before.days[target.dayIndex].meals[target.mealIndex].nutrition = "__TARGET_NUTRITION__";
    after.days[target.dayIndex].meals[target.mealIndex].nutrition = "__TARGET_NUTRITION__";
    before.days[target.dayIndex].meals[target.mealIndex].reason = "__TARGET_REASON__";
    after.days[target.dayIndex].meals[target.mealIndex].reason = "__TARGET_REASON__";
    before.days[target.dayIndex].meals[target.mealIndex].warnings = ["__TARGET_WARNINGS__"];
    after.days[target.dayIndex].meals[target.mealIndex].warnings = ["__TARGET_WARNINGS__"];
  }
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    throw new Error("替换结果修改了未选择的日期或餐次");
  }
}

export async function POST(request: Request) {
  const cookieHeader = request.headers.get("cookie") || "";
  const clientIdCookieValue = /(?:^|; )client_id=([^;]+)/.exec(cookieHeader)?.[1];
  const clientId = ensureClientId(clientIdCookieValue);
  const supabase = supabaseServer();

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {}

  const parsed = replaceMealRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "替换参数不合法", details: parsed.error.flatten() } },
      { status: 400, headers: { "Set-Cookie": clientIdCookie(clientId) } }
    );
  }

  const data = parsed.data;
  if (!usesLocalModelConfig(data.model_config)) {
    const access = await getHostedAccess(request);
    if (!access.allowed) return hostedAccessResponse(access);
  }

  const originalMenu = normalizeMenu(data.menu);
  const day = originalMenu.days[data.target.dayIndex];
  const meal = day?.meals[data.target.mealIndex];
  if (!day || !meal) {
    return NextResponse.json(
      { error: { code: "TARGET_NOT_FOUND", message: "目标餐次不存在" } },
      { status: 404, headers: { "Set-Cookie": clientIdCookie(clientId) } }
    );
  }

  if (data.scope === "dish" && data.target.dishIndex === undefined) {
    return NextResponse.json(
      { error: { code: "DISH_INDEX_REQUIRED", message: "换一道菜需要指定 dishIndex" } },
      { status: 400, headers: { "Set-Cookie": clientIdCookie(clientId) } }
    );
  }

  const targetDish = data.scope === "dish" ? meal.dishes?.[data.target.dishIndex ?? 0] : undefined;
  if (data.scope === "dish" && !targetDish) {
    return NextResponse.json(
      { error: { code: "TARGET_DISH_NOT_FOUND", message: "目标菜品不存在" } },
      { status: 404, headers: { "Set-Cookie": clientIdCookie(clientId) } }
    );
  }

  try {
    const result = await generateReplacement({
      menu: originalMenu,
      targetMeal: meal,
      targetDate: day.date,
      scope: data.scope,
      dish: targetDish,
      reason: REASON_LABELS[data.reason],
      prefs: data.preferences,
      modelConfig: data.model_config,
    });

    const updatedMenu = normalizeMenu(JSON.parse(JSON.stringify(originalMenu)));
    if (data.scope === "meal") {
      const replacementMeal: Meal = "meal" in result && result.meal
        ? result.meal
        : mealFromDishes(meal, ["dish" in result ? result.dish : fallbackDish([], data.preferences)], REASON_LABELS[data.reason]);
      updatedMenu.days[data.target.dayIndex].meals[data.target.mealIndex] = replacementMeal;
    } else {
      const dishes = [...(meal.dishes || [])];
      const replacementDish: Dish = "dish" in result && result.dish
        ? result.dish
        : "meal" in result && result.meal?.dishes?.[0]
          ? result.meal.dishes[0]
          : fallbackDish([], data.preferences);
      dishes[data.target.dishIndex ?? 0] = replacementDish;
      updatedMenu.days[data.target.dayIndex].meals[data.target.mealIndex] = mealFromDishes(meal, dishes, `已替换：${REASON_LABELS[data.reason]}`);
    }

    assertOnlyTargetChanged(originalMenu, updatedMenu, data.target, data.scope);
    const normalizedUpdated = normalizeMenu(updatedMenu);
    const targetIssues = findMealConstraintIssues(
      normalizedUpdated.days[data.target.dayIndex].meals[data.target.mealIndex],
      data.preferences,
      { date: day.date, mealIndex: data.target.mealIndex }
    );
    if (targetIssues.length > 0) {
      return NextResponse.json(
        {
          error: {
            code: "CONSTRAINT_CONFLICT",
            message: "替换结果与忌口或饮食限制冲突，已拒绝使用。",
            issues: targetIssues,
          },
        },
        { status: 422, headers: { "Set-Cookie": clientIdCookie(clientId) } }
      );
    }

    if (supabase) {
      await supabase
        .from("menus")
        .upsert({
          client_id: clientId,
          week_start: normalizedUpdated.week_start,
          start_date: getMenuStartDate(normalizedUpdated),
          end_date: normalizedUpdated.end_date,
          period_type: normalizedUpdated.period_type || "week",
          schema_version: normalizedUpdated.schema_version || 2,
          data: normalizedUpdated,
        }, { onConflict: "client_id,start_date" });
    }

    await writeProductEvent(supabase, {
      clientId,
      eventName: "meal_replaced",
      properties: {
        date: day.date || "",
        meal_type: meal.type || String(data.target.mealIndex),
        replace_scope: data.scope,
        reason: data.reason,
      },
    });

    return NextResponse.json(
      {
        clientId,
        menu: normalizedUpdated,
        source: result.source,
        replaced: {
          date: day.date,
          mealIndex: data.target.mealIndex,
          dishIndex: data.target.dishIndex,
          scope: data.scope,
          reason: data.reason,
        },
      },
      { status: 200, headers: { "Set-Cookie": clientIdCookie(clientId) } }
    );
  } catch {
    return NextResponse.json(
      { error: { code: "REPLACE_FAILED", message: "替换失败" } },
      { status: 500, headers: { "Set-Cookie": clientIdCookie(clientId) } }
    );
  }
}
