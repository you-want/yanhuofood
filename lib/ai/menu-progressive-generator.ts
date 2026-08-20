import OpenAI from "openai";
import { jsonResponseFormatOptions, modelCompatibilityOptions, resolveModelTimeoutMs } from "@/lib/ai/model-compatibility";
import { buildMenuDayDetailPrompt, buildMenuOutlinePrompt, buildMenuOutlineRepairPrompt, mergeDayDetails } from "@/lib/ai/menu-progressive-prompts";
import { generateMenu, type GenerateMenuOptions, type GenerateMenuResult } from "@/lib/ai/menu-generator";
import { isRetryableMenuRequestError } from "@/lib/ai/menu-retry";
import { classifyMenuGenerationError, MenuGenerationValidationError, parseMenuJson, validateGeneratedMenu } from "@/lib/ai/menu-validation";
import { normalizeDay, normalizeMenu } from "@/lib/domain/menu";
import { findMealConstraintIssues, findMenuConstraintIssues } from "@/lib/domain/menu-constraints";
import { hydrateMenuWithTrustedRecipes } from "@/lib/domain/recipe-grounding";
import { searchTrustedRecipes } from "@/lib/domain/recipe-search";
import { supabaseServer } from "@/lib/supabase";
import { daySchema } from "@/lib/schemas/menu";
import type { Day, Menu, Preferences } from "@/lib/types";

export type ProgressiveMenuStage = "planning" | "generating_days" | "finalizing";

export interface ProgressiveMenuUpdate {
  stage: ProgressiveMenuStage;
  menu: Menu;
  completedDays: number;
  totalDays: number;
  currentDay?: number;
  failedDays: number[];
  warnings: string[];
}

interface CompletionLog {
  attempt: "generate" | "repair";
  durationMs: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  outputChars: number;
  ok: boolean;
  error?: string;
  errorType?: ReturnType<typeof classifyMenuGenerationError>;
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

function resolveModel(options: GenerateMenuOptions) {
  const clientApiKey = options.modelConfig?.enabled ? cleanConfigValue(options.modelConfig.api_key) : "";
  return {
    apiKey: clientApiKey || cleanConfigValue(process.env.OPENAI_API_KEY),
    model: options.modelConfig?.enabled
      ? cleanConfigValue(options.modelConfig.model)
      : cleanConfigValue(process.env.OPENAI_MODEL) || "gpt-4o-mini",
    baseURL: options.modelConfig?.enabled && options.modelConfig.base_url
      ? cleanConfigValue(options.modelConfig.base_url)
      : cleanConfigValue(process.env.OPENAI_BASE_URL),
    provider: (clientApiKey ? "browser" : "server") as "browser" | "server",
  };
}

function outlineMaxTokens(daysCount: GenerateMenuOptions["daysCount"]) {
  if (daysCount === 1) return 1200;
  return daysCount === 7 ? 3600 : 2800;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function requestCompletion(
  openai: OpenAI,
  model: string,
  prompt: string,
  maxTokens: number,
  attempt: CompletionLog["attempt"]
) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), resolveModelTimeoutMs(model));

  try {
    const completion = await openai.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: attempt === "repair" ? 0.1 : 0.35,
      max_tokens: maxTokens,
      ...modelCompatibilityOptions(model),
      ...jsonResponseFormatOptions(model),
    }, { signal: controller.signal });
    const text = completion.choices[0]?.message?.content?.trim() || "";
    const log: CompletionLog = {
      attempt,
      durationMs: Date.now() - startedAt,
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
    clearTimeout(timeout);
  }
}

function validateGeneratedDay(text: string, outlineDay: Day, options: GenerateMenuOptions, dayIndex: number, prefs: Preferences) {
  const parsed = daySchema.parse(parseMenuJson(text));
  const normalized = normalizeDay(parsed, dayIndex, outlineDay.date);
  if (normalized.meals.length !== options.mealCount) {
    throw new MenuGenerationValidationError(
      `Day ${dayIndex + 1} has ${normalized.meals.length} meals, expected ${options.mealCount}`,
      "meal_count_mismatch"
    );
  }
  if (normalized.meals.some((meal) => !meal.name)) {
    throw new MenuGenerationValidationError(`Day ${dayIndex + 1} contains an empty meal name`, "schema_error");
  }
  if (normalized.meals.some((meal) => !meal.dishes?.length)) {
    throw new MenuGenerationValidationError(`Day ${dayIndex + 1} contains a meal without dish details`, "schema_error");
  }
  if (normalized.meals.some((meal) => meal.dishes?.some((dish) => !dish.ingredients?.length || !dish.steps?.length))) {
    throw new MenuGenerationValidationError(`Day ${dayIndex + 1} contains incomplete ingredients or steps`, "schema_error");
  }
  const merged = mergeDayDetails(outlineDay, normalized);
  const issues = merged.meals.flatMap((meal, mealIndex) => findMealConstraintIssues(meal, prefs, { date: merged.date, mealIndex }));
  if (issues.length) {
    throw new MenuGenerationValidationError(`Generated day violates hard constraints: ${issues.map((issue) => issue.message).join("；")}`, "constraint_violation");
  }
  return merged;
}

function validateOutlineQuality(menu: Menu, dishesPerMeal: number) {
  const normalized = normalizeMenu({
    ...menu,
    days: menu.days.map((day) => ({
      ...day,
      meals: day.meals.map((meal) => {
        const names = meal.name.split("、").map((name) => name.trim()).filter(Boolean).slice(0, dishesPerMeal);
        return {
          ...meal,
          name: names.join("、"),
          title: names.join("、"),
          dishes: names.map((name, index) => ({
            ...(meal.dishes?.[index] || {}),
            name,
            ingredients: [],
            seasonings: [],
            steps: [],
          })),
        };
      }),
    })),
  });
  const placeholderPattern = /^(菜名|具体菜名|菜品|示例菜|某菜|dish)[\s\-]*[a-z0-9一二三四五六七八九十]*$/i;
  const invalidName = normalized.days
    .flatMap((day) => day.meals)
    .flatMap((meal) => meal.name.split("、"))
    .map((name) => name.trim())
    .find((name) => !name || placeholderPattern.test(name));

  if (invalidName !== undefined) {
    throw new MenuGenerationValidationError(`Menu outline contains placeholder dish name: ${invalidName || "empty"}`, "schema_error");
  }
  return normalized;
}

export async function generateMenuProgressively(
  prefs: Preferences,
  options: GenerateMenuOptions,
  onProgress: (update: ProgressiveMenuUpdate) => Promise<void> | void
): Promise<GenerateMenuResult> {
  const startedAt = Date.now();
  const connection = resolveModel(options);

  if (!connection.apiKey) {
    return generateMenu(prefs, options);
  }

  const recipeCandidates = options.recipeCandidates ?? await searchTrustedRecipes(supabaseServer(), prefs, options.feedbackSummary);
  const effectiveOptions = { ...options, recipeCandidates };
  const openai = new OpenAI({ apiKey: connection.apiKey, baseURL: connection.baseURL, timeout: resolveModelTimeoutMs(connection.model) + 5_000, maxRetries: 0 });
  const attempts: CompletionLog[] = [];
  const warnings: string[] = [];
  const failedDays: number[] = [];
  let outline: Menu;

  try {
    const generation = await requestCompletion(
      openai,
      connection.model,
      buildMenuOutlinePrompt(prefs, effectiveOptions),
      outlineMaxTokens(options.daysCount),
      "generate"
    );
    try {
      const validation = validateGeneratedMenu(generation.text, { ...options, preferences: prefs });
      generation.log.ok = true;
      attempts.push(generation.log);
      outline = validateOutlineQuality(validation.menu, options.dishesPerMeal);
      warnings.push(...validation.warnings);
    } catch (validationError) {
      generation.log.error = errorMessage(validationError);
      generation.log.errorType = classifyMenuGenerationError(validationError, generation.text);
      attempts.push(generation.log);
      const repair = await requestCompletion(
        openai,
        connection.model,
        buildMenuOutlineRepairPrompt(prefs, effectiveOptions, generation.text, errorMessage(validationError)),
        outlineMaxTokens(options.daysCount),
        "repair"
      );
      const validation = validateGeneratedMenu(repair.text, { ...options, preferences: prefs });
      repair.log.ok = true;
      attempts.push(repair.log);
      outline = validateOutlineQuality(validation.menu, options.dishesPerMeal);
      warnings.push("菜单提纲首次输出不完整，已自动修复。", ...validation.warnings);
    }
  } catch (error) {
    console.error("Progressive menu outline generation failed", error);
    const fallback = await generateMenu(prefs, options);
    return {
      ...fallback,
      warnings: ["渐进式菜单提纲生成失败，已切换为整份生成。", ...fallback.warnings],
    };
  }

  let menu = normalizeMenu(outline);
  await onProgress({
    stage: "generating_days",
    menu,
    completedDays: 0,
    totalDays: menu.days.length,
    currentDay: 0,
    failedDays,
    warnings,
  });

  const ready = new Map<number, Day>();
  let nextWorkIndex = 0;
  let nextCommitIndex = 0;
  let commitQueue = Promise.resolve();

  const commitReadyDays = () => {
    const queued = commitQueue.then(async () => {
      while (ready.has(nextCommitIndex)) {
        const day = ready.get(nextCommitIndex);
        ready.delete(nextCommitIndex);
        if (day) {
          menu = normalizeMenu({
            ...menu,
            days: menu.days.map((existingDay, index) => index === nextCommitIndex ? day : existingDay),
            summary: undefined,
          });
        }
        nextCommitIndex += 1;
        await onProgress({
          stage: nextCommitIndex >= menu.days.length ? "finalizing" : "generating_days",
          menu,
          completedDays: nextCommitIndex,
          totalDays: menu.days.length,
          currentDay: nextCommitIndex < menu.days.length ? nextCommitIndex : undefined,
          failedDays: [...failedDays],
          warnings: [...warnings],
        });
      }
    });
    commitQueue = queued.catch(() => {});
    return queued;
  };

  const worker = async () => {
    while (nextWorkIndex < menu.days.length) {
      const dayIndex = nextWorkIndex;
      nextWorkIndex += 1;
      const outlineDay = outline.days[dayIndex];
      let generatedDay: Day | null = null;
      let previousText = "";
      let previousError = "";

      for (let attemptIndex = 0; attemptIndex < 2 && !generatedDay; attemptIndex += 1) {
        try {
          const response = await requestCompletion(
            openai,
            connection.model,
            buildMenuDayDetailPrompt(
              prefs,
              effectiveOptions,
              outline,
              dayIndex,
              attemptIndex === 1 ? previousText : undefined,
              attemptIndex === 1 ? previousError : undefined
            ),
            2600,
            attemptIndex === 0 ? "generate" : "repair"
          );
          previousText = response.text;
          try {
            generatedDay = validateGeneratedDay(response.text, outlineDay, options, dayIndex, prefs);
            response.log.ok = true;
          } catch (validationError) {
            response.log.error = errorMessage(validationError);
            response.log.errorType = classifyMenuGenerationError(validationError, response.text);
            previousError = response.log.error;
          }
          attempts.push(response.log);
        } catch (error) {
          previousError = errorMessage(error);
          attempts.push({
            attempt: attemptIndex === 0 ? "generate" : "repair",
            durationMs: 0,
            outputChars: 0,
            ok: false,
            error: previousError,
            errorType: "unknown",
          });
          if (!isRetryableMenuRequestError(error)) break;
        }
      }

      if (!generatedDay) {
        failedDays.push(dayIndex);
        warnings.push(`第 ${dayIndex + 1} 天详情暂未补齐，已保留菜单提纲。`);
        generatedDay = outlineDay;
      }

      ready.set(dayIndex, generatedDay);
      await commitReadyDays();
    }
  };

  const workerCount = Math.min(2, menu.days.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  await commitQueue;

  const remainingIssues = findMenuConstraintIssues(menu, prefs);
  if (remainingIssues.length) {
    warnings.push(`仍有 ${remainingIssues.length} 处硬约束冲突，相关日期仅保留提纲，请重试失败日期。`);
  }

  const durationMs = Date.now() - startedAt;
  console.info(JSON.stringify({
    scope: "ai_menu_generation",
    status: failedDays.length ? "partial_success" : "success",
    mode: "progressive",
    model: connection.model,
    provider: connection.provider,
    startDate: options.startDate,
    daysCount: options.daysCount,
    durationMs,
    failedDays,
    attempts,
  }));

  const grounding = hydrateMenuWithTrustedRecipes(menu, recipeCandidates, prefs.diners_count || 1);
  return {
    menu: grounding.menu,
    source: "ai",
    warnings: Array.from(new Set(warnings)),
    meta: {
      model: connection.model,
      provider: connection.provider,
      durationMs,
      attempts,
      grounding: {
        candidateCount: recipeCandidates.length,
        groundedCount: grounding.groundedCount,
        generatedCount: grounding.generatedCount,
      },
    },
  };
}
