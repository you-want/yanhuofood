import { normalizeIngredientName } from "@/lib/domain/recipe-normalize";
import type { Recipe } from "@/lib/types";
import type { RecipeAskQuestionType, RecipeAskResponse } from "@/lib/schemas/recipe-knowledge";

const QUESTION_PATTERNS: Array<[RecipeAskQuestionType, RegExp]> = [
  ["why_recommended", /为什么|为何|推荐|适合我|理由|原因/],
  ["adjust_servings", /\d+\s*(人|位)|人数|份量|分量|几人份|一人份|两人份|三人份|四人份/],
  ["equipment_alternative", /设备|烤箱|空气炸锅|微波炉|电饭煲|高压锅|蒸箱|平底锅|炒锅|砂锅/],
  ["replace_ingredient", /替换|替代|换成|没有.{0,12}(怎么办|怎么做)|不吃.{0,12}(怎么办|怎么换)/],
  ["reduce_oil_salt", /少油|减油|低油|少盐|减盐|低盐|清淡|油盐/],
  ["prep_ahead", /提前|预制|备菜|隔夜|前一天|预处理/],
  ["use_leftovers", /剩余|剩菜|剩下|余料|库存|现有食材|冰箱/],
];

export function classifyRecipeQuestion(question: string): RecipeAskQuestionType {
  const normalized = question.trim().toLowerCase();
  return QUESTION_PATTERNS.find(([, pattern]) => pattern.test(normalized))?.[0] || "other";
}

export function buildRecipeQuestionContext(recipe: Recipe, dinersCount?: number, availableIngredients: string[] = []) {
  return {
    id: recipe.id,
    name: recipe.name,
    cuisine: recipe.cuisine,
    source_recipe_id: recipe.source_recipe_id || recipe.id,
    source_name: recipe.source?.name || "烟火食间菜谱库",
    source_url: recipe.source_url || null,
    servings: recipe.servings || null,
    target_servings: dinersCount || null,
    cooking_time_minutes: recipe.cooking_time_minutes || null,
    difficulty: recipe.difficulty || null,
    ingredients: (recipe.ingredient_details || []).map((item) => ({
      name: item.name,
      normalized_name: item.normalized_name,
      amount: item.amount ?? null,
      unit: item.unit || null,
      optional: Boolean(item.optional),
    })),
    seasonings: (recipe.seasonings || []).map((item) => ({
      name: item.name,
      amount: item.amount ?? null,
      unit: item.unit || null,
    })),
    steps: (recipe.steps || []).map((step) => step.instruction),
    nutrition: recipe.nutrition || { calories: recipe.calories },
    equipment: recipe.equipment || [],
    tags: recipe.tags || [],
    evidence: recipe.evidence,
    available_ingredients: availableIngredients,
  };
}

function sourceFor(recipe: Recipe) {
  return [{
    source_recipe_id: recipe.source_recipe_id || recipe.id,
    name: recipe.source?.name || recipe.source_name || "烟火食间菜谱库",
    url: recipe.source_url || null,
  }];
}

function servingsSuggestion(recipe: Recipe, dinersCount?: number) {
  const base = recipe.servings || 1;
  const target = dinersCount || base;
  const ratio = Math.round((target / base) * 100) / 100;
  const examples = [...(recipe.ingredient_details || []), ...(recipe.seasonings || [])]
    .filter((item) => typeof item.amount === "number")
    .slice(0, 5)
    .map((item) => `${item.name}约 ${Math.round((item.amount || 0) * ratio * 10) / 10}${item.unit || ""}`);
  return {
    title: `${base} 人份调整为 ${target} 人份`,
    detail: examples.length
      ? `食材按 ${ratio} 倍调整：${examples.join("、")}。调味料先少放，出锅前再校正。`
      : `主要食材按 ${ratio} 倍调整；盐、酱油等调味不要机械等比增加，建议先加到预计量的七成再试味。`,
  };
}

function replacementSuggestion(recipe: Recipe, question: string) {
  const ingredients = [...(recipe.ingredient_details || []), ...(recipe.seasonings || [])];
  const target = ingredients.find((item) => question.includes(item.name) || question.includes(item.normalized_name));
  const replacements: Record<string, string> = {
    牛肉: "可换鸡腿肉、猪里脊或杏鲍菇；肉类需重新确认熟度。",
    猪肉: "可换鸡腿肉、牛肉或豆腐；按替代食材的熟成时间调整步骤。",
    鸡蛋: "可用嫩豆腐增加嫩滑口感，但凝固和裹浆效果不同。",
    牛奶: "可换无糖豆浆或燕麦奶，注意甜度与蛋白质含量变化。",
    番茄: "可换彩椒加少量醋或番茄膏，酸甜度需边尝边调。",
    土豆: "可换山药、芋头或莲藕，烹饪时间会不同。",
  };
  const key = target ? normalizeIngredientName(target.name) : "";
  return {
    title: target ? `替换 ${target.name}` : "替换原则",
    detail: replacements[key] || "优先选择烹饪作用相近的食材：主蛋白换主蛋白、淀粉类换淀粉类、叶菜换耐热程度相近的叶菜。首次替换先减少用量，并根据含水量和熟成时间调整。",
  };
}

export function buildRuleBasedRecipeAnswer(input: {
  recipe: Recipe;
  question: string;
  questionType?: RecipeAskQuestionType;
  dinersCount?: number;
  availableIngredients?: string[];
}): RecipeAskResponse {
  const { recipe, question, dinersCount, availableIngredients = [] } = input;
  const questionType = input.questionType || classifyRecipeQuestion(question);
  const sources = sourceFor(recipe);
  const common = { question_type: questionType, warnings: [] as string[], sources, confidence: "medium" as const };

  switch (questionType) {
    case "why_recommended": {
      const reasons = recipe.evidence?.reasons?.length
        ? recipe.evidence.reasons
        : [recipe.cooking_time_minutes ? `${recipe.cooking_time_minutes} 分钟左右可完成` : "做法来自当前菜谱上下文", ...(recipe.tags || []).slice(0, 2)];
      return { ...common, answer: `推荐 ${recipe.name} 的依据是：${reasons.join("；")}。这些理由来自当前菜单候选评分和菜谱信息，不代表医疗或营养治疗建议。`, suggestions: reasons.map((reason) => ({ title: "推荐依据", detail: reason })), confidence: recipe.evidence ? "high" : "medium" };
    }
    case "replace_ingredient":
      return { ...common, answer: "可以替换，但应同时考虑食材在这道菜里的作用、含水量和熟成时间。", suggestions: [replacementSuggestion(recipe, question)], warnings: ["涉及过敏、乳糜泻或严格宗教饮食时，不要只依赖名称替换，请核对包装配料和交叉污染信息。"] };
    case "reduce_oil_salt":
      return { ...common, answer: "可以先从烹饪顺序和增香方式下手，而不是单纯牺牲风味。", suggestions: [
        { title: "减少用油", detail: "使用不粘锅或先煸出食材自身油脂；炒香阶段少量用油，后续用水、清汤或焖煮完成。" },
        { title: "减少盐分", detail: "盐、生抽、蚝油等含钠调味合并计算，先减到原建议量的 60%–70%，用醋、香辛料、葱姜蒜和菌菇提味。" },
      ], warnings: ["如需严格控钠或有肾脏、心血管等疾病，请按医生或注册营养师给出的具体标准执行。"] };
    case "adjust_servings":
      return { ...common, answer: "主要食材可按人数比例缩放，调味料和烹饪时间需要保守调整。", suggestions: [servingsSuggestion(recipe, dinersCount)], confidence: recipe.servings && dinersCount ? "high" : "medium" };
    case "equipment_alternative":
      return { ...common, answer: "可用能提供相似加热方式的设备替代，但温度、时间和含水量要重新观察。", suggestions: [
        { title: "烤/空气炸替代", detail: "没有烤箱或空气炸锅时，可用加盖平底锅小火焖熟后开盖收干；分批处理避免拥挤出水。" },
        { title: "高压/电饭煲替代", detail: "可改用普通锅小火炖煮，液体略增加，并以食材软烂程度而不是固定时间判断完成。" },
      ], warnings: ["不同设备功率差异较大，肉类和海鲜应确认中心熟透。"] };
    case "prep_ahead":
      return { ...common, answer: "可把清洗、切配、腌制和基础酱汁提前完成，但易氧化和易出水食材尽量临做前处理。", suggestions: [
        { title: "可提前", detail: "耐储存蔬菜切配、葱姜蒜分装、肉类冷藏腌制、干料称量和酱汁预混。" },
        { title: "临做前", detail: "叶菜、番茄、豆腐和需要保持酥脆的食材尽量临近烹饪再切或下锅。" },
      ], warnings: ["生熟分开密封冷藏；肉类腌制后尽快烹饪，室温放置不要超过安全时限。"] };
    case "use_leftovers": {
      const matched = availableIngredients.filter((available) => [...(recipe.ingredient_details || []), ...(recipe.seasonings || [])].some((item) => normalizeIngredientName(item.name) === normalizeIngredientName(available)));
      return { ...common, answer: matched.length ? `现有食材中，${matched.join("、")} 可以直接用于这道菜。` : "可以按同类食材替换或把余料做成配菜，但不要为了清库存破坏忌口和食品安全要求。", suggestions: [
        { title: "优先消耗", detail: matched.length ? `先使用：${matched.join("、")}。其余食材按易腐程度安排，叶菜和已开封豆制品优先。` : "先用已开封、易腐和临近保质期食材，再考虑耐储存根茎和干货。" },
        { title: "余料去向", detail: "少量蔬菜可加入汤、炒饭或蛋饼；熟肉可彻底加热后用于面饭浇头。" },
      ], warnings: ["不确定保存时间、出现异味或曾长时间处于室温的剩余食材应丢弃。"] };
    }
    default:
      return { ...common, answer: `我会围绕 ${recipe.name} 的现有食材、步骤和来源回答。当前信息不足以可靠判断的部分不会编造。`, suggestions: [
        { title: "可继续问", detail: "可以具体询问替换某种食材、减少油盐、调整人数、设备替代、提前备菜或余料利用。" },
      ], confidence: "low" };
  }
}
