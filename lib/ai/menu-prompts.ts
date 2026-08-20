import { addDaysToDate, getDayCodeForDate } from "@/lib/domain/menu";
import { menuGenerationParameterSnapshot } from "@/lib/domain/menu-generation-request";
import { FESTIVAL_CONFIG, getMenuScenarioPrompt } from "@/lib/ai/menu-prompt-scenarios";
import type { MenuGenerationErrorType } from "@/lib/ai/menu-validation";
import { compactRecipeCandidates } from "@/lib/domain/recipe-grounding";
import type { DishFeedbackSummary, FestivalType, MenuDays, MenuScenario, Preferences, RecipeCandidate } from "@/lib/types";

export interface MenuPromptOptions {
  startDate: string;
  mealCount: number;
  daysCount: MenuDays;
  dishesPerMeal: number;
  scenario?: MenuScenario;
  festivalType?: FestivalType;
  festivalTheme?: string;
  feedbackSummary?: DishFeedbackSummary;
  recipeCandidates?: RecipeCandidate[];
}

export type MenuRepairReason = MenuGenerationErrorType;

const AI_DISH_DETAIL_LIMIT = 1;

function menuDateRange(options: MenuPromptOptions) {
  const endDate = addDaysToDate(options.startDate, options.daysCount - 1);
  return {
    endDate,
    dayText: options.daysCount === 1 ? `${options.startDate} 的一日` : `${options.startDate} 至 ${endDate} 的连续${options.daysCount}天`,
  };
}

export function buildMenuGenerationPrompt(prefs: Preferences, options: MenuPromptOptions) {
  const cuisine = prefs.cuisines || "中式家常";
  const restrictions = prefs.dietary_restrictions || [];
  const disliked = prefs.disliked_ingredients || [];
  const mealCount = options.mealCount;
  const countDesc = mealCount === 5 ? "早餐、加餐、午餐、午点、晚餐" : mealCount === 4 ? "早餐、午餐、晚餐、加餐" : "早餐、午餐、晚餐";
  const { endDate, dayText } = menuDateRange(options);
  const energyPolicy = prefs.energy_display === "off" ? "热量可以估算但前端可隐藏" : "每餐和每道菜都估算热量";
  const halalText = prefs.halal ? "遵循清真(不含猪肉、酒精等)" : "无需清真";
  const group = prefs.special_group || null;
  const groupText = group ? `考虑${group === "children" ? "儿童" : group === "elderly" ? "老年人" : "孕妇"}的营养与禁忌` : "一般人群";
  const healthGoal = prefs.health_goal || (prefs.light_meal ? "fat_loss" : "balanced");
  const scenario = getMenuScenarioPrompt(options.scenario || "daily_home");
  const festivalConfig = options.festivalType ? FESTIVAL_CONFIG[options.festivalType] : null;
  const festivalTheme = options.festivalTheme?.trim();
  const festivalText = festivalConfig || festivalTheme
    ? `节日：${[festivalConfig ? `${festivalConfig.label}（${festivalConfig.description}）` : "", festivalTheme ? `用户主题/备注：${festivalTheme}` : ""].filter(Boolean).join("；")}。传统菜品推荐：${festivalConfig?.traditionalDishes.join("、") || "按用户主题和当地习俗推荐"}。`
    : "";
  const periodType = options.daysCount === 1 ? "day" : "week";
  const detailedDishCount = options.daysCount === 1 ? options.dishesPerMeal : Math.min(options.dishesPerMeal, AI_DISH_DETAIL_LIMIT);
  const dishNamesText = options.dishesPerMeal > 1
    ? options.daysCount === 1
      ? `每餐 name 中列出${options.dishesPerMeal}个菜名，用顿号分隔；dishes 数组输出全部${detailedDishCount}个菜的结构化食材和做法。`
      : `每餐 name 中列出${options.dishesPerMeal}个菜名，用顿号分隔；dishes 数组只输出前${detailedDishCount}个代表菜的结构化食材，其他菜名只保留在 name 中。`
    : "每餐输出 1 个菜。";
  const detailPolicy = options.daysCount === 1
    ? "一日菜单要更完整：每道菜都输出结构化 ingredients、seasonings 和 2 到 3 条简短 steps；每条 step 不超过 35 个中文字。"
    : "严格控制输出长度。每道菜最多 3 个 ingredients、最多 2 个 seasonings、steps 最多 1 条且不超过 25 个中文字。";
  const parameterSnapshot = menuGenerationParameterSnapshot(prefs, options.startDate);
  const feedback = options.feedbackSummary;
  const candidateSummaries = compactRecipeCandidates(options.recipeCandidates || []);
  const candidateText = candidateSummaries.length
    ? `下面是服务端已通过硬约束过滤的可信菜谱候选。优先使用候选，使用时必须原样返回 source_recipe_id；允许按用户要求做少油少盐等轻量调整并写入 adaptation_note。没有合适候选时可生成新菜，但不得伪造 source_recipe_id。\n${JSON.stringify(candidateSummaries, null, 2)}`
    : "可信菜谱候选本次不可用，可按现有规则生成菜品，不得伪造 source_recipe_id。";
  const feedbackText = feedback && (feedback.liked_dishes.length || feedback.blocked_dishes.length || feedback.cooked_dishes.length)
    ? [
        feedback.liked_dishes.length ? `用户喜欢：${feedback.liked_dishes.join("、")}。可少量召回同名或相似风格菜品。` : "",
        feedback.cooked_dishes.length ? `用户做过：${feedback.cooked_dishes.join("、")}。优先保留熟悉做法，但本周期不要整周照搬。` : "",
        feedback.blocked_dishes.length ? `用户不想再吃：${feedback.blocked_dishes.join("、")}。必须排除这些菜名和高度相似菜品。` : "",
        "同一周内不要重复同名菜；沿用上周偏好时要保留人数、餐次、预算和时间限制，同时给出季节性或采购便利性的变化。",
      ].filter(Boolean).join("\n- ")
    : "暂无历史菜品反馈。";

  return `你是一个专业但谨慎的日常饮食规划助手。请生成${dayText}菜单。
最终参数快照（这是本次请求的事实来源，不得自行改写）：
${JSON.stringify(parameterSnapshot, null, 2)}

约束优先级：
- 硬约束：日期、天数、餐次数、每餐菜品数、忌口、清真和特殊人群要求，必须满足。
- 软偏好：菜系、预算、健康目标、烹饪时间和历史反馈，应尽量满足。

要求：
- 计划日期：${options.startDate} 至 ${endDate}，days 数组必须按日期顺序输出
- 顶层必须输出 start_date；为兼容旧数据也必须同步输出 week_start，两个字段都等于 ${options.startDate}
- 每天必须包含 date 字段(YYYY-MM-DD)，day 字段必须是该日期真实星期英文缩写：Mon, Tue, Wed, Thu, Fri, Sat, Sun
- 每天${mealCount}餐：${countDesc}
- 每餐${options.dishesPerMeal}个菜品
- ${dishNamesText}
- 菜系/口味：${cuisine}
- 饮食限制：${restrictions.join("、") || "无"}
- 忌口：${disliked.join("、") || "无"}
- ${halalText}
- 人群：${groupText}
- 健康目标：${healthGoal}
- 生成场景：${scenario.label}。${scenario.intent}
- 场景要求：${scenario.requirements.join("；")}
- ${festivalText}
- 用餐人数：${prefs.diners_count || 1}
- ${energyPolicy}
- 营养值为日常估算，不做医疗诊断
- ${detailPolicy}
- 历史反馈：
- ${feedbackText}
- 可信菜谱候选：
${candidateText}
- 使用可信候选时，dish.name 必须与候选 name 一致，并输出 source_recipe_id；服务端会覆盖模型编写的食材和步骤。
- 不使用候选时省略 source_recipe_id。
- category 只能使用英文枚举：grain, meat, seafood, egg_dairy, vegetable, fruit, soy, seasoning, other。
- difficulty 只能使用：easy, medium, hard。
- cooking_time_minutes 必须是大于 0 的整数；不确定就省略该字段。

只输出 JSON，不要 markdown，不要解释。
JSON 结构示例：
{
  "start_date": "${options.startDate}",
  "week_start": "${options.startDate}",
  "period_type": "${periodType}",
  "end_date": "${endDate}",
  "schema_version": 2,
  "days": [
    {
      "date": "${options.startDate}",
      "day": "${getDayCodeForDate(options.startDate)}",
      "meals": [
        {
          "type": "breakfast",
          "title": "餐食标题",
          "name": "菜名1、菜名2",
          "calories": 350,
          "nutrition": {"calories":350,"protein_g":20,"fat_g":10,"carbs_g":40,"fiber_g":5},
          "reason": "为什么适合用户",
          "warnings": [],
          "dishes": [
            {
              "name": "菜名",
              "source_recipe_id": "可选，必须来自候选列表",
              "adaptation_note": "可选，例如少盐",
              "ingredients": [{"name":"食材","amount":100,"unit":"g","category":"vegetable"}],
              "seasonings": [{"name":"盐","unit":"适量","category":"seasoning"}],
              "steps": ["一句话简短做法"],
              "calories": 200,
              "nutrition": {"calories":200,"protein_g":12,"fat_g":8,"carbs_g":20},
              "cooking_time_minutes": 20,
              "difficulty": "easy",
              "tags": ["家常"]
            }
          ]
        }
      ]
    }
  ]
}`;
}

export function buildMenuRepairPrompt(rawResponse: string, errorMessage: string, prefs: Preferences, options: MenuPromptOptions, reason: MenuRepairReason = "unknown") {
  const { endDate } = menuDateRange(options);
  const periodType = options.daysCount === 1 ? "day" : "week";
  const responseExcerpt = rawResponse.slice(0, 12000);
  const parameterSnapshot = menuGenerationParameterSnapshot(prefs, options.startDate);
  const reasonHints: Record<MenuRepairReason, string> = {
    no_json: "上次回复没有可解析的 JSON 对象。请重新输出完整 JSON，不要输出任何解释。",
    json_parse_error: "上次回复包含 JSON 语法错误。请修复引号、逗号、括号和数组闭合。",
    truncated_output: "上次回复疑似被截断。请补全缺失字段和结尾括号，必要时减少菜品说明长度。",
    schema_error: "上次回复字段结构不符合 schema。请补齐必填字段，并修正枚举值和字段类型。",
    date_mismatch: "上次回复日期、星期或起止日期不一致。请按指定开始日期连续输出，不要跳日或错配星期。",
    meal_count_mismatch: "上次回复每天餐次数不足或过多。请确保每一天都严格输出指定餐次数。",
    constraint_violation: "上次菜单违反忌口、清真或饮食限制。请替换所有冲突菜品和食材。",
    unknown: "请按要求修复为合法且完整的菜单 JSON。",
  };

  return `上一次菜单 JSON 无法通过解析或结构校验。
错误类型：${reason}
错误信息：
${errorMessage}

最终参数快照（修复时仍以此为事实来源，不得丢失或改写）：
${JSON.stringify(parameterSnapshot, null, 2)}

请只修复下面内容为合法 JSON，不要添加 markdown 或解释。
修复重点：
${reasonHints[reason]}

硬性要求：
- 顶层 start_date 和 week_start 都必须等于 ${options.startDate}
- period_type 必须等于 ${periodType}
- end_date 必须等于 ${endDate}
- days 必须是连续 ${options.daysCount} 天，并按日期顺序输出
- 每天必须有 ${options.mealCount} 餐，每餐 name 必须非空
- category、difficulty、meal type 必须使用英文枚举

待修复内容：
${responseExcerpt}`;
}
