import OpenAI from "openai";
import { jsonResponseFormatOptions, modelCompatibilityOptions } from "@/lib/ai/model-compatibility";
import { parseMenuJson } from "@/lib/ai/menu-validation";
import { todayMealRecommendationSchema } from "@/lib/schemas/menu";
import type { DishFeedbackSummary, LocalModelConfig, TodayMealContext, TodayMealRecommendation } from "@/lib/types";

interface TodayMealGenerationInput {
  context: TodayMealContext;
  cuisines?: string;
  dietaryRestrictions: string[];
  dislikedIngredients: string[];
  healthGoal: string;
  budgetLevel: string;
  feedbackSummary?: DishFeedbackSummary;
  modelConfig?: LocalModelConfig;
}

const SAMPLE_RECOMMENDATION: TodayMealRecommendation = {
  guidance: "根据当前条件整理了三个可以直接开做的方向，营养数据为日常估算。",
  options: [
    {
      id: "tomato-noodles",
      kind: "best_match",
      title: "首选方案",
      summary: "番茄鸡蛋面，温和省心的一餐",
      reason: "食材常见、做法简单，能在较短时间内完成，也容易按人数调整分量。",
      warnings: [],
      dish: {
        name: "番茄鸡蛋面",
        ingredients: [
          { name: "面条", amount: 100, unit: "g/人", category: "grain" },
          { name: "番茄", amount: 1, unit: "个/人", category: "vegetable" },
          { name: "鸡蛋", amount: 1, unit: "个/人", category: "egg_dairy" },
        ],
        seasonings: [{ name: "盐", unit: "适量", category: "seasoning" }],
        steps: ["番茄炒软后加水煮开。", "加入面条煮熟，再淋入蛋液调味。"],
        calories: 480,
        nutrition: { calories: 480, protein_g: 19, fat_g: 12, carbs_g: 72, fiber_g: 5 },
        cooking_time_minutes: 15,
        difficulty: "easy",
        tags: ["家常", "快手"],
      },
    },
    {
      id: "chicken-rice-bowl",
      kind: "quick",
      title: "更省事",
      summary: "鸡肉蔬菜焖饭，一锅完成",
      reason: "主食、蛋白质和蔬菜可以一起烹饪，清理工作更少。",
      warnings: [],
      dish: {
        name: "鸡肉蔬菜焖饭",
        ingredients: [
          { name: "熟米饭", amount: 180, unit: "g/人", category: "grain" },
          { name: "鸡腿肉", amount: 120, unit: "g/人", category: "meat" },
          { name: "胡萝卜", amount: 60, unit: "g/人", category: "vegetable" },
        ],
        seasonings: [{ name: "生抽", unit: "适量", category: "seasoning" }],
        steps: ["鸡肉和胡萝卜切小块后炒熟。", "加入熟米饭和少量生抽翻炒均匀。"],
        calories: 560,
        nutrition: { calories: 560, protein_g: 31, fat_g: 14, carbs_g: 76, fiber_g: 4 },
        cooking_time_minutes: 15,
        difficulty: "easy",
        tags: ["一锅出", "省事"],
      },
    },
    {
      id: "tofu-mushroom-soup",
      kind: "different",
      title: "换个口味",
      summary: "菌菇豆腐汤配米饭，清爽但有饱腹感",
      reason: "用菌菇和豆腐换一种口感，整体调味可以保持清淡。",
      warnings: [],
      dish: {
        name: "菌菇豆腐汤配米饭",
        ingredients: [
          { name: "豆腐", amount: 150, unit: "g/人", category: "soy" },
          { name: "菌菇", amount: 100, unit: "g/人", category: "vegetable" },
          { name: "大米", amount: 70, unit: "g/人", category: "grain" },
        ],
        seasonings: [{ name: "盐", unit: "适量", category: "seasoning" }],
        steps: ["菌菇炒香后加水煮开。", "放入豆腐煮熟，少量盐调味并搭配米饭。"],
        calories: 430,
        nutrition: { calories: 430, protein_g: 20, fat_g: 10, carbs_g: 65, fiber_g: 6 },
        cooking_time_minutes: 15,
        difficulty: "easy",
        tags: ["清淡", "豆制品"],
      },
    },
  ],
};

const SAMPLE_SIDE_DISHES = [
  {
    name: "清炒时蔬",
    ingredients: [{ name: "时令蔬菜", amount: 200, unit: "g/人", category: "vegetable" as const }],
    seasonings: [{ name: "食用油", unit: "适量", category: "seasoning" as const }, { name: "盐", unit: "适量", category: "seasoning" as const }],
    steps: ["蔬菜洗净切段。", "热锅少油快炒至断生，加盐调味。"],
    calories: 110,
    nutrition: { calories: 110, protein_g: 4, fat_g: 6, carbs_g: 12, fiber_g: 5 },
    cooking_time_minutes: 8,
    difficulty: "easy" as const,
    tags: ["家常", "蔬菜"],
  },
  {
    name: "凉拌黄瓜",
    ingredients: [{ name: "黄瓜", amount: 150, unit: "g/人", category: "vegetable" as const }],
    seasonings: [{ name: "醋", unit: "适量", category: "seasoning" as const }, { name: "生抽", unit: "适量", category: "seasoning" as const }],
    steps: ["黄瓜拍碎切段。", "加入调味料拌匀，静置几分钟即可。"],
    calories: 70,
    nutrition: { calories: 70, protein_g: 2, fat_g: 2, carbs_g: 10, fiber_g: 3 },
    cooking_time_minutes: 5,
    difficulty: "easy" as const,
    tags: ["清爽", "快手"],
  },
  {
    name: "紫菜蛋花汤",
    ingredients: [{ name: "紫菜", amount: 5, unit: "g/人", category: "vegetable" as const }, { name: "鸡蛋", amount: 1, unit: "个/人", category: "egg_dairy" as const }],
    seasonings: [{ name: "盐", unit: "适量", category: "seasoning" as const }],
    steps: ["锅中加水煮开，放入紫菜。", "淋入蛋液，凝固后加盐调味。"],
    calories: 95,
    nutrition: { calories: 95, protein_g: 8, fat_g: 5, carbs_g: 4, fiber_g: 1 },
    cooking_time_minutes: 8,
    difficulty: "easy" as const,
    tags: ["汤品", "快手"],
  },
];

function sampleRecommendation(dishesCount: number): TodayMealRecommendation {
  const count = Math.max(1, Math.min(4, dishesCount || 1));
  return {
    ...SAMPLE_RECOMMENDATION,
    options: SAMPLE_RECOMMENDATION.options.map((option) => {
      const dishes = [option.dish, ...(SAMPLE_SIDE_DISHES.slice(0, Math.max(0, count - 1)))];
      return {
        ...option,
        dishes,
        summary: count > 1 ? `${option.summary}，搭配 ${count - 1} 道小菜` : option.summary,
      };
    }),
  };
}

function clean(value?: string) {
  const trimmed = value?.trim() || "";
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) return trimmed.slice(1, -1).trim();
  return trimmed;
}

function prompt(input: TodayMealGenerationInput) {
  const feedback = input.feedbackSummary;
  return `你是烟火食间的即时饮食推荐助手。根据用户此刻状态生成三个真正不同、可以在家完成的单餐候选。

本次条件：
- 餐次：${input.context.meal_moment}
- 人数：${input.context.diners_count}
- 这顿几个菜：${input.context.dishes_count}
- 食欲：${input.context.appetite}
- 身体状态：${input.context.physical_state}
- 场景：${input.context.occasion}
- 最长时间：${input.context.available_minutes} 分钟
- 现有食材：${input.context.available_ingredients.join("、") || "未提供"}
- 本次备注：${input.context.note || "无"}
- 菜系口味：${input.cuisines || "家常、不过度重口"}
- 饮食限制：${input.dietaryRestrictions.join("、") || "无"}
- 忌口：${input.dislikedIngredients.join("、") || "无"}
- 健康目标：${input.healthGoal}
- 预算：${input.budgetLevel}
- 喜欢的菜：${feedback?.liked_dishes.join("、") || "无记录"}
- 不想再吃：${feedback?.blocked_dishes.join("、") || "无记录"}
- 最近做过：${feedback?.cooked_dishes.join("、") || "无记录"}

硬性要求：
- options 必须恰好 3 个，kind 依次覆盖 best_match、quick、different。
- 三个候选不能只是同一道菜换名字；quick 的耗时必须不超过用户时间，best_match 和 different 也不能超过。
- 必须排除忌口、不想再吃的菜和高度相似菜品。
- 优先利用现有食材，但不能编造用户拥有未提供的食材。
- reason 只能引用上面的明确条件，不得编造历史、天气或健康功效。
- 身体不适时只推荐温和的日常饮食，并在 warnings 提醒“仅作日常饮食参考，如持续不适请咨询专业人士”；不得诊断或宣称治疗。
- 每个候选方案必须包含恰好 ${input.context.dishes_count} 道菜；如果是 1 道菜也必须使用 dishes 数组。
- 每道菜都要独立输出完整 ingredients、seasonings、2 至 4 条 steps、营养估算、时间和难度；整顿饭的菜应当互相搭配，不要重复主食。
- 每个候选方案的总制作时间必须不超过用户时间；可以并行准备的菜按合理的总耗时估算。
- category 只能为 grain, meat, seafood, egg_dairy, vegetable, fruit, soy, seasoning, other。
- difficulty 只能为 easy, medium, hard。
- 只输出 JSON，不要 markdown。

输出结构：
{"guidance":"整体提示","options":[{"id":"稳定英文短标识","kind":"best_match","title":"首选方案","summary":"一句话摘要","reason":"可验证的推荐原因","warnings":[],"dishes":[{"name":"菜名","ingredients":[{"name":"食材","amount":100,"unit":"g","category":"vegetable"}],"seasonings":[],"steps":["步骤一","步骤二"],"calories":500,"nutrition":{"calories":500,"protein_g":20,"fat_g":15,"carbs_g":60,"fiber_g":5},"cooking_time_minutes":20,"difficulty":"easy","tags":["家常"]}]}]}`;
}

export async function generateTodayMeal(input: TodayMealGenerationInput) {
  const clientKey = input.modelConfig?.enabled ? clean(input.modelConfig.api_key) : "";
  const apiKey = clientKey || clean(process.env.OPENAI_API_KEY);
  const model = input.modelConfig?.enabled ? clean(input.modelConfig.model) : clean(process.env.OPENAI_MODEL) || "gpt-4o-mini";
  const baseURL = input.modelConfig?.enabled ? clean(input.modelConfig.base_url) : clean(process.env.OPENAI_BASE_URL);
  if (!apiKey) return { recommendation: sampleRecommendation(input.context.dishes_count), source: "sample" as const, warning: "模型 API Key 未配置，已展示样例推荐。" };

  try {
    const openai = new OpenAI({ apiKey, baseURL: baseURL || undefined, timeout: 45_000, maxRetries: 0 });
    const completion = await openai.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt(input) }],
      temperature: 0.5,
      max_tokens: 9000,
      ...modelCompatibilityOptions(model),
      ...jsonResponseFormatOptions(model),
    });
    const parsed = parseMenuJson(completion.choices[0]?.message?.content?.trim() || "");
    const recommendation = todayMealRecommendationSchema.parse(parsed);
    if (recommendation.options.some((option) => option.dishes?.length !== input.context.dishes_count)) {
      throw new Error("AI 返回的菜品数量与本次条件不一致");
    }
    return { recommendation, source: "ai" as const, warning: null };
  } catch (error) {
    console.error("Today meal generation failed", error);
    return { recommendation: sampleRecommendation(input.context.dishes_count), source: "sample" as const, warning: "AI 推荐暂时不可用，已展示样例推荐。" };
  }
}
