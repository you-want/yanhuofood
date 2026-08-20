import OpenAI from "openai";
import { isThinkingModel, jsonResponseFormatOptions, modelCompatibilityOptions } from "@/lib/ai/model-compatibility";
import { buildMenuGenerationPrompt, buildMenuRepairPrompt, type MenuRepairReason } from "@/lib/ai/menu-prompts";
import { isRetryableMenuRequestError } from "@/lib/ai/menu-retry";
import { classifyMenuGenerationError, normalizeGeneratedMenu, validateGeneratedMenu } from "@/lib/ai/menu-validation";
import { normalizeMenu } from "@/lib/domain/menu";
import { hydrateMenuWithTrustedRecipes } from "@/lib/domain/recipe-grounding";
import { searchTrustedRecipes } from "@/lib/domain/recipe-search";
import { supabaseServer } from "@/lib/supabase";
import type { DishFeedbackSummary, FestivalType, LocalModelConfig, Menu, MenuDays, MenuScenario, Preferences, RecipeCandidate } from "@/lib/types";

export function weekStart(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diffToMonday = (day + 6) % 7;
  d.setDate(d.getDate() - diffToMonday);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

const SAMPLE_MENU: Menu = normalizeMenu({
  week_start: weekStart(),
  period_type: "week",
  schema_version: 2,
  days: [
    {
      day: "Mon",
      meals: [
        {
          type: "breakfast",
          name: "皮蛋瘦肉粥",
          calories: 320,
          dishes: [
            {
              name: "皮蛋瘦肉粥",
              ingredients: [
                { name: "皮蛋", amount: 2, unit: "个", category: "egg_dairy" },
                { name: "瘦肉", amount: 100, unit: "g", category: "meat" },
                { name: "大米", amount: 150, unit: "g", category: "grain" },
              ],
              seasonings: [{ name: "葱花", unit: "适量", category: "seasoning" }],
              steps: ["大米煮至开花，加入瘦肉丝和皮蛋丁煮熟，最后撒葱花。"],
              calories: 320,
              nutrition: { calories: 320, protein_g: 18, fat_g: 8, carbs_g: 45, fiber_g: 1 },
              cooking_time_minutes: 35,
              difficulty: "easy",
              tags: ["早餐", "粥"],
            },
          ],
        },
        {
          type: "lunch",
          name: "番茄牛腩",
          calories: 620,
          dishes: [
            {
              name: "番茄牛腩",
              ingredients: [
                { name: "番茄", amount: 2, unit: "个", category: "vegetable" },
                { name: "牛腩", amount: 300, unit: "g", category: "meat" },
                { name: "洋葱", amount: 0.5, unit: "个", category: "vegetable" },
              ],
              seasonings: [
                { name: "姜", amount: 3, unit: "片", category: "seasoning" },
                { name: "生抽", unit: "适量", category: "seasoning" },
              ],
              steps: ["牛腩焯水后与番茄、洋葱炖煮至软烂。"],
              calories: 620,
              nutrition: { calories: 620, protein_g: 38, fat_g: 32, carbs_g: 42, fiber_g: 5 },
              cooking_time_minutes: 90,
              difficulty: "medium",
              tags: ["家常", "炖菜"],
            },
          ],
        },
        {
          type: "dinner",
          name: "清炒西兰花",
          calories: 120,
          dishes: [
            {
              name: "清炒西兰花",
              ingredients: [{ name: "西兰花", amount: 1, unit: "颗", category: "vegetable" }],
              seasonings: [
                { name: "大蒜", amount: 3, unit: "瓣", category: "seasoning" },
                { name: "盐", unit: "适量", category: "seasoning" },
              ],
              steps: ["西兰花焯水后用蒜末快炒，少盐调味。"],
              calories: 120,
              nutrition: { calories: 120, protein_g: 6, fat_g: 4, carbs_g: 16, fiber_g: 6 },
              cooking_time_minutes: 15,
              difficulty: "easy",
              tags: ["蔬菜", "清淡"],
            },
          ],
        },
      ],
    },
    { day: "Tue", meals: [
      { type: "breakfast", name: "鸡蛋三明治", calories: 350 },
      { type: "lunch", name: "宫保鸡丁", calories: 580 },
      { type: "dinner", name: "蒜蓉生菜", calories: 90 },
    ] },
    { day: "Wed", meals: [
      { type: "breakfast", name: "燕麦牛奶", calories: 280 },
      { type: "lunch", name: "红烧鱼块", calories: 540 },
      { type: "dinner", name: "紫菜蛋花汤", calories: 110 },
    ] },
    { day: "Thu", meals: [
      { type: "breakfast", name: "豆浆油条", calories: 420 },
      { type: "lunch", name: "咖喱土豆鸡", calories: 600 },
      { type: "dinner", name: "凉拌黄瓜", calories: 80 },
    ] },
    { day: "Fri", meals: [
      { type: "breakfast", name: "牛奶麦片", calories: 300 },
      { type: "lunch", name: "菌菇炖豆腐", calories: 450 },
      { type: "dinner", name: "清炒菠菜", calories: 100 },
    ] },
    { day: "Sat", meals: [
      { type: "breakfast", name: "水果酸奶", calories: 260 },
      { type: "lunch", name: "香煎三文鱼", calories: 520 },
      { type: "dinner", name: "烤南瓜", calories: 150 },
    ] },
    { day: "Sun", meals: [
      { type: "breakfast", name: "鸡蛋面条", calories: 430 },
      { type: "lunch", name: "什锦炒饭", calories: 680 },
      { type: "dinner", name: "海带汤", calories: 90 },
    ] },
  ],
});

const DEFAULT_MODEL_TIMEOUT_MS: Record<MenuDays, number> = {
  1: 60_000,
  5: 90_000,
  7: 120_000,
};

function applyOptions(menu: Menu, options: GenerateMenuOptions): Menu {
  return normalizeGeneratedMenu(normalizeMenu(menu), { ...options, allowSyntheticMeals: true }).menu;
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

export interface GenerateMenuOptions {
  startDate: string;
  mealCount: number;
  daysCount: MenuDays;
  dishesPerMeal: number;
  scenario?: MenuScenario;
  festivalType?: FestivalType;
  festivalTheme?: string;
  feedbackSummary?: DishFeedbackSummary;
  modelConfig?: LocalModelConfig;
  recipeCandidates?: RecipeCandidate[];
}

interface GenerationAttemptLog {
  attempt: "generate" | "repair";
  durationMs: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  outputChars: number;
  ok: boolean;
  error?: string;
  errorType?: MenuRepairReason;
}

export interface GenerateMenuResult {
  menu: Menu;
  source: "ai" | "sample";
  warnings: string[];
  meta: {
    model: string;
    provider: "browser" | "server";
    durationMs: number;
    attempts: GenerationAttemptLog[];
    grounding: { candidateCount: number; groundedCount: number; generatedCount: number };
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function logGenerationEvent(event: Record<string, unknown>) {
  console.info(JSON.stringify({ scope: "ai_menu_generation", ...event }));
}

function menuMaxTokens(daysCount: MenuDays) {
  if (daysCount === 1) return 4500;
  return daysCount === 7 ? 9000 : 6500;
}

// Thinking models spend significant time on hidden reasoning tokens, so a
// whole-week generation needs a much larger per-call budget than a fast model.
const THINKING_MODEL_TIMEOUT_MS: Record<MenuDays, number> = {
  1: 120_000,
  5: 180_000,
  7: 240_000,
};

function generationTimeoutMs(daysCount: MenuDays, model: string) {
  const configured = Number(process.env.OPENAI_REQUEST_TIMEOUT_MS);
  if (Number.isFinite(configured) && configured >= 5_000) return configured;
  return isThinkingModel(model)
    ? THINKING_MODEL_TIMEOUT_MS[daysCount]
    : DEFAULT_MODEL_TIMEOUT_MS[daysCount];
}

export async function generateMenu(prefs: Preferences, options: GenerateMenuOptions): Promise<GenerateMenuResult> {
  const startedAt = Date.now();
  const recipeCandidates = options.recipeCandidates ?? await searchTrustedRecipes(supabaseServer(), prefs, options.feedbackSummary);
  const effectiveOptions = { ...options, recipeCandidates };
  const fallbackBase = applyOptions(SAMPLE_MENU, effectiveOptions);
  const fallbackGrounding = hydrateMenuWithTrustedRecipes(fallbackBase, recipeCandidates, prefs.diners_count || 1);
  const fallback = fallbackGrounding.menu;
  const clientApiKey = options.modelConfig?.enabled ? cleanConfigValue(options.modelConfig.api_key) : "";
  const apiKey = clientApiKey || cleanConfigValue(process.env.OPENAI_API_KEY);
  const model = options.modelConfig?.enabled ? cleanConfigValue(options.modelConfig.model) : cleanConfigValue(process.env.OPENAI_MODEL) || "gpt-4o-mini";
  const baseURL = options.modelConfig?.enabled && options.modelConfig.base_url ? cleanConfigValue(options.modelConfig.base_url) : cleanConfigValue(process.env.OPENAI_BASE_URL);
  const timeoutMs = generationTimeoutMs(options.daysCount, model);
  const provider = clientApiKey ? "browser" : "server";
  const attempts: GenerationAttemptLog[] = [];

  if (!apiKey) {
    return {
      menu: fallback,
      source: "sample",
      warnings: ["模型 API Key 未配置，已使用样例菜单。"],
      meta: { model, provider, durationMs: Date.now() - startedAt, attempts, grounding: { candidateCount: recipeCandidates.length, groundedCount: fallbackGrounding.groundedCount, generatedCount: fallbackGrounding.generatedCount } },
    };
  }

  // Each model call gets its own timeout budget so a slow first attempt cannot
  // starve the repair attempt. `overallDeadline` caps total wall-clock so
  // generate + repair (+ transient retries) stays under the route's maxDuration.
  const overallDeadline = startedAt + Math.min(timeoutMs * 2 + 10_000, 280_000);
  let timedOut = false;

  try {
    const openai = new OpenAI({ apiKey, baseURL, timeout: timeoutMs + 5_000, maxRetries: 0 });
    const requestCompletion = async (attempt: GenerationAttemptLog["attempt"], prompt: string, maxTokens: number) => {
      const attemptStartedAt = Date.now();
      const remaining = overallDeadline - attemptStartedAt;
      if (remaining <= 1_000) {
        timedOut = true;
        throw new Error("AI 生成时间预算已用尽");
      }
      const controller = new AbortController();
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, Math.min(timeoutMs, remaining));
      try {
        const completion = await openai.chat.completions.create({
          model,
          messages: [{ role: "user", content: prompt }],
          temperature: attempt === "repair" ? 0.1 : 0.4,
          max_tokens: maxTokens,
          ...modelCompatibilityOptions(model),
          ...jsonResponseFormatOptions(model),
        }, {
          signal: controller.signal,
        });
        const text = completion.choices[0]?.message?.content?.trim() || "";
        const log: GenerationAttemptLog = {
          attempt,
          durationMs: Date.now() - attemptStartedAt,
          promptTokens: completion.usage?.prompt_tokens,
          completionTokens: completion.usage?.completion_tokens,
          totalTokens: completion.usage?.total_tokens,
          outputChars: text.length,
          ok: false,
        };
        return {
          text,
          log,
        };
      } finally {
        clearTimeout(timer);
      }
    };

    const requestCompletionWithTransientRetry = async (
      attempt: GenerationAttemptLog["attempt"],
      prompt: string,
      maxTokens: number
    ) => {
      try {
        return await requestCompletion(attempt, prompt, maxTokens);
      } catch (error) {
        attempts.push({
          attempt,
          durationMs: 0,
          outputChars: 0,
          ok: false,
          error: errorMessage(error),
          errorType: "unknown",
        });
        if (timedOut || !isRetryableMenuRequestError(error)) throw error;
        return requestCompletion(attempt, prompt, maxTokens);
      }
    };

    const generation = await requestCompletionWithTransientRetry(
      "generate",
      buildMenuGenerationPrompt(prefs, effectiveOptions),
      menuMaxTokens(options.daysCount)
    );

    try {
      const validation = validateGeneratedMenu(generation.text, { ...options, preferences: prefs });
      generation.log.ok = true;
      attempts.push(generation.log);
      const durationMs = Date.now() - startedAt;
      logGenerationEvent({ status: "success", model, provider, startDate: options.startDate, daysCount: options.daysCount, mealCount: options.mealCount, dishesPerMeal: options.dishesPerMeal, durationMs, attempts, warnings: validation.warnings });
      const grounding = hydrateMenuWithTrustedRecipes(validation.menu, recipeCandidates, prefs.diners_count || 1);
      return { menu: grounding.menu, source: "ai", warnings: validation.warnings, meta: { model, provider, durationMs, attempts, grounding: { candidateCount: recipeCandidates.length, groundedCount: grounding.groundedCount, generatedCount: grounding.generatedCount } } };
    } catch (validationError) {
      generation.log.error = errorMessage(validationError);
      generation.log.errorType = classifyMenuGenerationError(validationError, generation.text);
      attempts.push(generation.log);
      if (timedOut) throw validationError;

      const repair = await requestCompletionWithTransientRetry(
        "repair",
        buildMenuRepairPrompt(generation.text, errorMessage(validationError), prefs, effectiveOptions, generation.log.errorType),
        menuMaxTokens(options.daysCount)
      );
      try {
        const validation = validateGeneratedMenu(repair.text, { ...options, preferences: prefs });
        repair.log.ok = true;
        attempts.push(repair.log);
        const durationMs = Date.now() - startedAt;
        logGenerationEvent({ status: "repaired", model, provider, startDate: options.startDate, daysCount: options.daysCount, mealCount: options.mealCount, dishesPerMeal: options.dishesPerMeal, durationMs, attempts, warnings: validation.warnings });
        const grounding = hydrateMenuWithTrustedRecipes(validation.menu, recipeCandidates, prefs.diners_count || 1);
        return {
          menu: grounding.menu,
          source: "ai",
          warnings: ["AI 首次输出格式不完整，已自动修复后使用。", ...validation.warnings],
          meta: {
            model,
            provider,
            durationMs,
            attempts,
            grounding: {
              candidateCount: recipeCandidates.length,
              groundedCount: grounding.groundedCount,
              generatedCount: grounding.generatedCount,
            },
          },
        };
      } catch (repairError) {
        repair.log.error = errorMessage(repairError);
        repair.log.errorType = classifyMenuGenerationError(repairError, repair.text);
        attempts.push(repair.log);
        throw repairError;
      }
    }
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    console.error("AI menu generation failed", error);
    logGenerationEvent({ status: "fallback", model, provider, startDate: options.startDate, daysCount: options.daysCount, mealCount: options.mealCount, dishesPerMeal: options.dishesPerMeal, durationMs, attempts, error: errorMessage(error), timeout: timedOut });
    const timeoutWarning = timedOut ? "AI 生成超时，已使用样例菜单。建议减少天数、餐次或每餐菜品数后重试。" : "AI 生成失败，已使用样例菜单。";
    return { menu: fallback, source: "sample", warnings: [timeoutWarning], meta: { model, provider, durationMs, attempts, grounding: { candidateCount: recipeCandidates.length, groundedCount: fallbackGrounding.groundedCount, generatedCount: fallbackGrounding.generatedCount } } };
  }
}
