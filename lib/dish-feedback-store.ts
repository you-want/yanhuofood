import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeDishFeedbackName } from "@/lib/domain/dish-feedback";
import { withSupabaseTimeout } from "@/lib/supabase";
import type { DishFeedbackEntry } from "@/lib/types";

function isMissingTableError(error: { message?: string; code?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() || "";
  return error?.code === "42P01" || message.includes("dish_feedback") || message.includes("relation") && message.includes("does not exist");
}

export async function readDishFeedbackEntries(supabase: SupabaseClient | null, clientId: string) {
  if (!supabase) return { entries: [] as DishFeedbackEntry[], localOnly: true };

  const { data, error } = await withSupabaseTimeout(
    supabase
      .from("dish_feedback")
      .select("*")
      .eq("client_id", clientId)
      .order("updated_at", { ascending: false })
      .limit(200)
  );

  if (error) {
    if (isMissingTableError(error)) return { entries: [] as DishFeedbackEntry[], localOnly: true };
    throw error;
  }

  return {
    entries: (data || []).map((entry) => ({
      ...entry,
      dish_key: entry.dish_key || normalizeDishFeedbackName(entry.dish_name || ""),
    })) as DishFeedbackEntry[],
    localOnly: false,
  };
}

export { isMissingTableError };
