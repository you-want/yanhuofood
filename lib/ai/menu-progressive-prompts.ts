import { compactRecipeCandidates } from "@/lib/domain/recipe-grounding";
import { addDaysToDate, getDayCodeForDate } from "@/lib/domain/menu";
import { menuGenerationParameterSnapshot } from "@/lib/domain/menu-generation-request";
import type { Day, Menu, Preferences } from "@/lib/types";
import type { MenuPromptOptions } from "@/lib/ai/menu-prompts";

function preferenceSummary(prefs: Preferences, options: MenuPromptOptions) {
  const feedback = options.feedbackSummary;
  return [
    `菜系/口味：${prefs.cuisines || "中式家常"}`,
    `饮食限制：${prefs.dietary_restrictions?.join("、") || "无"}`,
    `忌口：${prefs.disliked_ingredients?.join("、") || "无"}`,
    `清真要求：${prefs.halal ? "是，避开猪肉、酒精等" : "无"}`,
    `特殊人群：${prefs.special_group || "一般人群"}`,
    `健康目标：${prefs.health_goal || (prefs.light_meal ? "fat_loss" : "balanced")}`,
    `生成场景：${options.scenario || prefs.scenario || "daily_home"}`,
    options.festivalType ? `节日类型：${options.festivalType}` : "",
    options.festivalTheme ? `节日主题：${options.festivalTheme}` : "",
    `用餐人数：${prefs.diners_count || 1}`,
    `预算：${prefs.budget_level || "medium"}`,
    `单餐时间限制：${prefs.cooking_time_limit || 45} 分钟`,
    feedback?.liked_dishes.length ? `喜欢的菜：${feedback.liked_dishes.join("、")}` : "",
    feedback?.cooked_dishes.length ? `做过的菜：${feedback.cooked_dishes.join("、")}` : "",
    feedback?.blocked_dishes.length ? `必须排除的菜：${feedback.blocked_dishes.join("、")}` : "",
  ].filter(Boolean).join("\n- ");
}

function candidateSummary(options: MenuPromptOptions) {
  const candidates = compactRecipeCandidates(options.recipeCandidates || []);
  return candidates.length
    ? `优先从以下可信菜谱候选选择菜名；详情阶段使用候选时必须返回对应 source_recipe_id，不得伪造：\n${JSON.stringify(candidates, null, 2)}`
    : "本次没有可用的可信菜谱候选，可生成新菜，但不得编造 source_recipe_id。";
}

function mealTypes(mealCount: number) {
  if (mealCount === 5) return ["breakfast", "snack", "lunch", "snack", "dinner"];
  if (mealCount === 4) return ["breakfast", "lunch", "dinner", "snack"];
  if (mealCount === 3) return ["breakfast", "lunch", "dinner"];
  return Array.from({ length: mealCount }, (_, index) => index === 0 ? "breakfast" : index === mealCount - 1 ? "dinner" : "snack");
}

export function buildMenuOutlinePrompt(prefs: Preferences, options: MenuPromptOptions) {
  const endDate = addDaysToDate(options.startDate, options.daysCount - 1);
  const types = mealTypes(options.mealCount);
  const parameterSnapshot = menuGenerationParameterSnapshot(prefs, options.startDate);
  const dayExample = {
    date: options.startDate,
    day: getDayCodeForDate(options.startDate),
    meals: types.map((type, index) => ({
      type,
      name: Array.from({ length: options.dishesPerMeal }, (_, dishIndex) => `具体菜名${index + 1}-${dishIndex + 1}`).join("、"),
      calories: 400,
      reason: "一句简短搭配理由",
      dishes: [],
    })),
  };

  return `你是日常饮食规划助手。先生成一份轻量的菜单提纲，只规划菜名和餐次，不输出食材、调料或做法。

最终参数快照（本次生成的事实来源，不得遗漏或改写）：
${JSON.stringify(parameterSnapshot, null, 2)}

硬性要求：
- 日期从 ${options.startDate} 到 ${endDate}，连续 ${options.daysCount} 天
- 每天严格 ${options.mealCount} 餐，餐次顺序参考：${types.join(", ")}
- 每餐 name 中严格列出 ${options.dishesPerMeal} 个菜名，多道菜用顿号分隔
- 全周期避免重复同名或高度相似菜品
- days 中必须包含准确的 date 和英文星期缩写 day
- dishes 数组保持为空，详情将在后续按天补充
- 只输出合法 JSON，不要 markdown 或解释

用户要求：
- ${preferenceSummary(prefs, options)}

可信菜谱规则：
${candidateSummary(options)}

输出结构：
${JSON.stringify({
    start_date: options.startDate,
    week_start: options.startDate,
    end_date: endDate,
    period_type: options.daysCount === 1 ? "day" : "week",
    schema_version: 2,
    days: [dayExample],
  }, null, 2)}`;
}

export function buildMenuOutlineRepairPrompt(
  prefs: Preferences,
  options: MenuPromptOptions,
  previousResponse: string,
  previousError: string
) {
  return `${buildMenuOutlinePrompt(prefs, options)}

上一次提纲不可用：${previousError}
请重新生成完整提纲，必须使用真实、具体、可烹饪的菜名，禁止输出“菜名1”“具体菜名1-1”“菜品A”“示例菜”等占位内容。
上一次输出仅用于避免重复错误：
${previousResponse.slice(0, 5000)}`;
}

export function buildMenuDayDetailPrompt(
  prefs: Preferences,
  options: MenuPromptOptions,
  outline: Menu,
  dayIndex: number,
  previousResponse?: string,
  previousError?: string
) {
  const target = outline.days[dayIndex];
  const parameterSnapshot = menuGenerationParameterSnapshot(prefs, options.startDate);
  const allNames = outline.days.flatMap((day) => day.meals.map((meal) => meal.name));
  const retryText = previousResponse
    ? `\n上一次输出未通过校验：${previousError || "结构不合法"}\n请重新输出完整当天 JSON。不要解释。上次输出仅供纠错：\n${previousResponse.slice(0, 5000)}`
    : "";
  const trustedCandidates = candidateSummary(options);
  const outputExample = {
    date: target.date,
    day: target.day,
    meals: target.meals.map((meal) => ({
      type: meal.type,
      name: meal.name,
      calories: meal.calories || 400,
      nutrition: { calories: meal.calories || 400, protein_g: 20, fat_g: 12, carbs_g: 45, fiber_g: 5 },
      reason: meal.reason || "为什么适合本次菜单",
      warnings: [],
      dishes: [{
        name: meal.name.split("、")[0],
        source_recipe_id: "可选，必须来自可信候选",
        adaptation_note: "可选，例如少盐",
        ingredients: [{ name: "具体食材", amount: 100, unit: "g", category: "vegetable" }],
        seasonings: [{ name: "盐", unit: "适量", category: "seasoning" }],
        steps: ["处理食材。", "烹饪至熟并调味。"],
        calories: meal.calories || 400,
        nutrition: { calories: meal.calories || 400, protein_g: 20, fat_g: 12, carbs_g: 45 },
        cooking_time_minutes: 20,
        difficulty: "easy",
        tags: ["家常"],
      }],
    })),
  };

  return `你是日常菜谱助手。菜单菜名已经锁定，请只为 ${target.date} 补充当天的结构化详情，不得修改日期、餐次数量、餐次顺序或菜名。

整周菜名用于避免混淆：
${allNames.map((name, index) => `${index + 1}. ${name}`).join("\n")}

当天固定提纲：
${JSON.stringify(target, null, 2)}

最终参数快照（补齐详情时仍以此为事实来源）：
${JSON.stringify(parameterSnapshot, null, 2)}

用户要求：
- ${preferenceSummary(prefs, options)}

硬性要求：
- 顶层直接输出一天对象：date、day、meals、nutrition（可选）
- meals 数组严格 ${options.mealCount} 项，并保持提纲中的 type 和 name
- 每餐 dishes 至少输出 1 个代表菜；若 name 包含多道菜，可为每道菜输出详情，但不要杜撰新菜名
- 每道菜输出 ingredients、seasonings、steps、calories、nutrition、cooking_time_minutes、difficulty、tags
- 可信菜谱规则：${trustedCandidates}
- 使用候选时输出对应 source_recipe_id 且菜名保持一致；不使用候选时省略 source_recipe_id
- ingredients 最多 5 项，seasonings 最多 3 项，steps 2 到 3 条且每条简短
- category 只能是 grain, meat, seafood, egg_dairy, vegetable, fruit, soy, seasoning, other
- difficulty 只能是 easy, medium, hard
- 只输出合法 JSON，不要 markdown 或解释

输出结构示例（菜名必须保持当天固定提纲，示例食材必须替换为真实内容）：
${JSON.stringify(outputExample, null, 2)}
${retryText}`;
}

export function mergeDayDetails(outlineDay: Day, generatedDay: Day): Day {
  return {
    ...generatedDay,
    date: outlineDay.date,
    day: outlineDay.day,
    meals: outlineDay.meals.map((outlineMeal, mealIndex) => {
      const generatedMeal = generatedDay.meals[mealIndex];
      const lockedDishNames = outlineMeal.name.split("、").map((name) => name.trim()).filter(Boolean);
      return {
        ...generatedMeal,
        type: outlineMeal.type,
        title: generatedMeal?.title || outlineMeal.title,
        name: outlineMeal.name,
        calories: generatedMeal?.calories || outlineMeal.calories,
        dishes: generatedMeal?.dishes?.length
          ? generatedMeal.dishes.map((dish, dishIndex) => ({
              ...dish,
              name: lockedDishNames[dishIndex] || dish.name,
            }))
          : outlineMeal.dishes,
        reason: generatedMeal?.reason || outlineMeal.reason,
        warnings: generatedMeal?.warnings || outlineMeal.warnings,
      };
    }),
  };
}
