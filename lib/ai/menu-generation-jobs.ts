import type { SupabaseClient } from "@supabase/supabase-js";
import { countMenuDishes, writeProductEvent } from "@/lib/analytics/product-events";
import { writeMenuGenerationLog } from "@/lib/ai/menu-generation-log";
import { generateMenuProgressively, type ProgressiveMenuUpdate } from "@/lib/ai/menu-progressive-generator";
import { buildDishFeedbackSummary, mergeDishFeedbackSummaries } from "@/lib/domain/dish-feedback";
import { getMenuStartDate } from "@/lib/domain/menu";
import { menuGenerationParameterSnapshot, resolveMenuGenerationPreferences } from "@/lib/domain/menu-generation-request";
import { readDishFeedbackEntries } from "@/lib/dish-feedback-store";
import type { generateMenuRequestSchema } from "@/lib/schemas/menu";
import type { Preferences } from "@/lib/types";
import type { z } from "zod";

type GenerateMenuRequestData = z.infer<typeof generateMenuRequestSchema>;

interface RunMenuGenerationJobOptions {
  supabase: SupabaseClient;
  jobId: string;
  clientId: string;
  requestData: GenerateMenuRequestData;
  storedPrefs: Preferences | null;
  startDate: string;
}

async function updateJobRunningState(
  supabase: SupabaseClient,
  jobId: string,
  clientId: string,
  values: Record<string, unknown>,
  fallbackValues: Record<string, unknown>
) {
  const { error } = await supabase
    .from("menu_generation_jobs")
    .update(values)
    .eq("id", jobId)
    .eq("client_id", clientId);

  if (error) {
    await supabase
      .from("menu_generation_jobs")
      .update(fallbackValues)
      .eq("id", jobId)
      .eq("client_id", clientId);
  }
}

function progressivePayload(update: ProgressiveMenuUpdate) {
  return {
    partial: true,
    menu: update.menu,
    source: "ai",
    warnings: update.warnings,
    progress: {
      stage: update.stage,
      completed_days: update.completedDays,
      total_days: update.totalDays,
      current_day: update.currentDay,
      failed_days: update.failedDays,
    },
  };
}

export async function runMenuGenerationJob({
  supabase,
  jobId,
  clientId,
  requestData,
  storedPrefs,
  startDate,
}: RunMenuGenerationJobOptions) {
  const startedAt = new Date().toISOString();
  const finalPrefs = resolveMenuGenerationPreferences(storedPrefs, requestData);
  const parameterSnapshot = menuGenerationParameterSnapshot(finalPrefs, startDate);
  const mealCount = finalPrefs.meal_count!;
  const daysCount = finalPrefs.days!;
  const dishesPerMeal = finalPrefs.dishes_per_meal!;
  await updateJobRunningState(
    supabase,
    jobId,
    clientId,
    {
      status: "running",
      stage: "planning",
      completed_days: 0,
      total_days: daysCount,
      heartbeat_at: startedAt,
      started_at: startedAt,
    },
    { status: "running", started_at: startedAt }
  );

  await writeProductEvent(supabase, {
    clientId,
    eventName: "generation_started",
    properties: {
      days: daysCount,
      meal_count: mealCount,
      diners_count: finalPrefs.diners_count || 1,
      scenario: finalPrefs.scenario || "daily_home",
      task_id: jobId,
    },
  });

  try {
    console.info(JSON.stringify({ scope: "menu_generation_parameters", jobId, ...parameterSnapshot }));
    const storedFeedback = await readDishFeedbackEntries(supabase, clientId).catch(() => ({ entries: [] }));
    const feedbackSummary = mergeDishFeedbackSummaries(
      requestData.feedback_summary,
      buildDishFeedbackSummary(storedFeedback.entries)
    );
    const result = await generateMenuProgressively(finalPrefs, {
      startDate,
      mealCount,
      daysCount,
      dishesPerMeal,
      scenario: finalPrefs.scenario,
      festivalType: finalPrefs.festival_type,
      festivalTheme: finalPrefs.festival_theme,
      feedbackSummary,
      modelConfig: requestData.model_config,
    }, async (update) => {
    const { data: currentJob } = await supabase
      .from("menu_generation_jobs")
      .select("status")
      .eq("id", jobId)
      .eq("client_id", clientId)
      .maybeSingle();

    if (currentJob?.status === "cancelled") {
      throw new Error("Job was cancelled by user");
    }

    const payload = progressivePayload(update);
    await updateJobRunningState(
      supabase,
      jobId,
      clientId,
      {
        status: "running",
        stage: update.stage,
        partial_result: payload,
        completed_days: update.completedDays,
        total_days: update.totalDays,
        current_day: update.currentDay ?? null,
        heartbeat_at: new Date().toISOString(),
        warnings: update.warnings,
      },
      {
        status: "running",
        result: payload,
        warnings: update.warnings,
      }
    );
  });

    const resultStartDate = getMenuStartDate(result.menu);
    const { error: richSaveError } = await supabase
      .from("menus")
      .upsert({
        client_id: clientId,
        week_start: result.menu.week_start,
        data: result.menu,
        source: result.source,
        schema_version: result.menu.schema_version || 2,
        start_date: resultStartDate,
        end_date: result.menu.end_date,
        period_type: result.menu.period_type || "week",
        preferences_snapshot: finalPrefs,
      }, { onConflict: "client_id,start_date" });

    if (richSaveError) {
      await supabase
        .from("menus")
        .upsert({
          client_id: clientId,
          week_start: result.menu.week_start,
          data: result.menu,
        });
    }

    const generationStatus = result.source === "sample"
      ? "fallback"
      : result.meta.attempts.some((attempt) => attempt.attempt === "repair" && attempt.ok)
        ? "repaired"
        : "success";

    await writeMenuGenerationLog(supabase, {
      clientId,
      startDate: resultStartDate,
      status: generationStatus,
      source: result.source,
      model: result.meta.model,
      provider: result.meta.provider,
      durationMs: result.meta.durationMs,
      attempts: result.meta.attempts,
      warnings: result.warnings,
      parameterSnapshot,
      grounding: result.meta.grounding,
    });

    await writeProductEvent(supabase, {
      clientId,
      eventName: "generation_completed",
      properties: {
        source: result.source,
        duration_ms: result.meta.durationMs,
        warning_count: result.warnings.length,
        dish_count: countMenuDishes(result.menu),
      },
    });

    const payload = {
      menu: result.menu,
      source: result.source,
      warnings: result.warnings,
      generation: result.meta,
    };

    await updateJobRunningState(
      supabase,
      jobId,
      clientId,
      {
        status: "succeeded",
        stage: "completed",
        result: payload,
        partial_result: payload,
        completed_days: result.menu.days.length,
        total_days: result.menu.days.length,
        current_day: null,
        warnings: result.warnings,
        heartbeat_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
      },
      {
        status: "succeeded",
        result: payload,
        warnings: result.warnings,
        finished_at: new Date().toISOString(),
      }
    );

    return { status: "succeeded" as const, result: payload };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateJobRunningState(
      supabase,
      jobId,
      clientId,
      {
        status: "failed",
        stage: "failed",
        error_code: error instanceof Error ? error.name : "unknown",
        error_message: message.slice(0, 500),
        heartbeat_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
      },
      {
        status: "failed",
        error_message: message.slice(0, 500),
        finished_at: new Date().toISOString(),
      }
    );

    await writeMenuGenerationLog(supabase, {
      clientId,
      startDate,
      status: "failed",
      errorMessage: message,
      parameterSnapshot,
    });

    await writeProductEvent(supabase, {
      clientId,
      eventName: "generation_failed",
      properties: {
        error_type: error instanceof Error ? error.name : "unknown",
        stage: "generate_job",
        is_retry: false,
      },
    });

    return { status: "failed" as const, error: message };
  }
}
