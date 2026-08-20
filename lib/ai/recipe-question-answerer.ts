import OpenAI from "openai";
import { jsonResponseFormatOptions, modelCompatibilityOptions } from "@/lib/ai/model-compatibility";
import { parseMenuJson } from "@/lib/ai/menu-validation";
import { buildRecipeQuestionContext, buildRuleBasedRecipeAnswer, classifyRecipeQuestion } from "@/lib/domain/recipe-question";
import { recipeAskResponseSchema, type RecipeAskQuestionType } from "@/lib/schemas/recipe-knowledge";
import type { LocalModelConfig, Recipe } from "@/lib/types";

interface RecipeQuestionInput {
  recipe: Recipe;
  question: string;
  questionType?: RecipeAskQuestionType;
  dinersCount?: number;
  availableIngredients?: string[];
  modelConfig?: LocalModelConfig;
}

function clean(value?: string) {
  const trimmed = value?.trim() || "";
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) return trimmed.slice(1, -1).trim();
  return trimmed;
}

function buildPrompt(input: RecipeQuestionInput, questionType: RecipeAskQuestionType) {
  const context = buildRecipeQuestionContext(input.recipe, input.dinersCount, input.availableIngredients);
  return `你是烟火食间的菜谱上下文助手。只根据给定菜谱上下文回答，不得编造来源、功效、历史或不存在的食材。

问题类型：${questionType}
用户问题：${input.question}
菜谱上下文：${JSON.stringify(context)}

要求：
- 回答必须围绕当前菜谱，简洁、可执行。
- 如果是人数调整，按原 servings 和目标人数说明比例；盐、酱油等调味料不可机械等比增加。
- 如果是替换食材，说明口感、含水量、熟成时间或过敏风险变化。
- 如果是减少油盐，不宣称治疗疾病；严格控盐等情况提示咨询专业人士。
- 食品安全不确定时给出明确 warning。
- sources 只能使用上下文中的 source_recipe_id、source_name、source_url，不得生成新来源。
- confidence 只能是 high、medium、low。
- 只输出 JSON，不要 markdown。

输出结构：
{"question_type":"${questionType}","answer":"回答","suggestions":[{"title":"建议标题","detail":"具体做法"}],"warnings":[],"sources":[{"source_recipe_id":"${context.source_recipe_id}","name":"${context.source_name}","url":${context.source_url ? JSON.stringify(context.source_url) : "null"}}],"confidence":"medium"}`;
}

export async function answerRecipeQuestion(input: RecipeQuestionInput) {
  const questionType = input.questionType || classifyRecipeQuestion(input.question);
  const fallback = buildRuleBasedRecipeAnswer({ ...input, questionType });
  const clientKey = input.modelConfig?.enabled ? clean(input.modelConfig.api_key) : "";
  const apiKey = clientKey || clean(process.env.OPENAI_API_KEY);
  const model = input.modelConfig?.enabled ? clean(input.modelConfig.model) : clean(process.env.OPENAI_MODEL) || "gpt-4o-mini";
  const baseURL = input.modelConfig?.enabled ? clean(input.modelConfig.base_url) : clean(process.env.OPENAI_BASE_URL);
  if (!apiKey) return { response: fallback, source: "rules" as const, warning: "模型 API Key 未配置，已使用规则型菜谱建议。" };

  try {
    const openai = new OpenAI({ apiKey, baseURL: baseURL || undefined, timeout: 45_000, maxRetries: 0 });
    const completion = await openai.chat.completions.create({
      model,
      messages: [{ role: "user", content: buildPrompt(input, questionType) }],
      temperature: 0.25,
      max_tokens: 1800,
      ...modelCompatibilityOptions(model),
      ...jsonResponseFormatOptions(model),
    });
    const parsed = recipeAskResponseSchema.parse(parseMenuJson(completion.choices[0]?.message?.content?.trim() || ""));
    return { response: { ...parsed, question_type: questionType }, source: "ai" as const, warning: null };
  } catch (error) {
    console.error("Recipe question answering failed", error);
    return { response: fallback, source: "rules" as const, warning: "AI 回答暂时不可用，已使用规则型菜谱建议。" };
  }
}
