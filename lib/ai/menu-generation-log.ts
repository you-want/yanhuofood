import type { SupabaseClient } from "@supabase/supabase-js";
import type { MenuGenerationErrorType } from "@/lib/ai/menu-validation";

type GenerationAttempt = {
  attempt: "generate" | "repair";
  durationMs: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  outputChars: number;
  ok: boolean;
  error?: string;
  errorType?: MenuGenerationErrorType;
};

export type MenuGenerationLogStatus = "cache" | "success" | "repaired" | "fallback" | "failed";

export interface MenuGenerationLogInput {
  clientId: string;
  startDate?: string;
  status: MenuGenerationLogStatus;
  source?: string;
  model?: string;
  provider?: "browser" | "server";
  durationMs?: number;
  attempts?: GenerationAttempt[];
  warnings?: string[];
  errorType?: MenuGenerationErrorType;
  errorMessage?: string;
  parameterSnapshot?: Record<string, unknown>;
  grounding?: { candidateCount: number; groundedCount: number; generatedCount: number };
}

function truncateMessage(message: string | undefined) {
  if (!message) return undefined;
  return message.slice(0, 500);
}

function inferErrorType(attempts: GenerationAttempt[] | undefined): MenuGenerationErrorType | undefined {
  return [...(attempts || [])].reverse().find((attempt) => attempt.errorType)?.errorType;
}

function inferErrorMessage(attempts: GenerationAttempt[] | undefined) {
  return [...(attempts || [])].reverse().find((attempt) => attempt.error)?.error;
}

export async function writeMenuGenerationLog(
  supabase: SupabaseClient | null,
  input: MenuGenerationLogInput
) {
  const payload = {
    client_id: input.clientId,
    start_date: input.startDate,
    status: input.status,
    source: input.source,
    model: input.model,
    provider: input.provider,
    duration_ms: input.durationMs,
    attempts: input.attempts || [],
    warnings: input.warnings || [],
    error_type: input.errorType || inferErrorType(input.attempts),
    error_message: truncateMessage(input.errorMessage || inferErrorMessage(input.attempts)),
    parameter_snapshot: input.parameterSnapshot,
    grounding: input.grounding,
  };

  if (!supabase) {
    console.info(JSON.stringify({ scope: "menu_generation_log", storage: "console", ...payload }));
    return;
  }

  const { error } = await supabase.from("menu_generation_logs").insert(payload);
  if (error) {
    console.info(JSON.stringify({
      scope: "menu_generation_log",
      storage: "console_fallback",
      logError: error.message,
      ...payload,
    }));
  }
}
