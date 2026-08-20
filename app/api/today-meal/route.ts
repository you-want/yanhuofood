import { NextResponse } from "next/server";
import { generateTodayMeal } from "@/lib/ai/today-meal-generator";
import { buildDishFeedbackSummary, mergeDishFeedbackSummaries } from "@/lib/domain/dish-feedback";
import { readDishFeedbackEntries } from "@/lib/dish-feedback-store";
import { todayMealRequestSchema } from "@/lib/schemas/menu";
import { supabaseServer } from "@/lib/supabase";
import type { Preferences } from "@/lib/types";
import { ensureClientId } from "@/lib/user";
import { getHostedAccess, hostedAccessResponse, usesLocalModelConfig } from "@/lib/supabase-auth";

function readPrefsFromCookie(cookieHeader: string): Preferences | null {
  const match = /(?:^|; )prefs=([^;]+)/.exec(cookieHeader);
  if (!match) return null;
  try { return JSON.parse(decodeURIComponent(match[1])); } catch { return null; }
}

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { body = {}; }
  const parsed = todayMealRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "即时推荐参数不合法", details: parsed.error.flatten() } }, { status: 400 });

  if (!usesLocalModelConfig(parsed.data.model_config)) {
    const access = await getHostedAccess(request);
    if (!access.allowed) return hostedAccessResponse(access);
  }

  const cookieHeader = request.headers.get("cookie") || "";
  const clientId = ensureClientId(/(?:^|; )client_id=([^;]+)/.exec(cookieHeader)?.[1]);
  const supabase = supabaseServer();
  const storedPreferences = supabase
    ? (await supabase.from("preferences").select("*").eq("client_id", clientId).maybeSingle()).data as Preferences | null
    : readPrefsFromCookie(cookieHeader);
  const stored = supabase ? await readDishFeedbackEntries(supabase, clientId).catch(() => ({ entries: [] })) : { entries: [] };
  const feedbackSummary = mergeDishFeedbackSummaries(parsed.data.feedback_summary, buildDishFeedbackSummary(stored.entries));
  const result = await generateTodayMeal({
    context: parsed.data.context,
    cuisines: parsed.data.cuisines || storedPreferences?.cuisines,
    dietaryRestrictions: Array.from(new Set([...(storedPreferences?.dietary_restrictions || []), ...parsed.data.dietary_restrictions])),
    dislikedIngredients: Array.from(new Set([...(storedPreferences?.disliked_ingredients || []), ...parsed.data.disliked_ingredients])),
    healthGoal: parsed.data.health_goal || storedPreferences?.health_goal || "balanced",
    budgetLevel: parsed.data.budget_level || storedPreferences?.budget_level || "medium",
    feedbackSummary,
    modelConfig: parsed.data.model_config,
  });
  return NextResponse.json(result);
}
