import { NextResponse } from "next/server";
import { answerRecipeQuestion } from "@/lib/ai/recipe-question-answerer";
import { normalizeRecipe } from "@/lib/domain/recipe-normalize";
import { recipeAskRequestSchema } from "@/lib/schemas/recipe-knowledge";
import { supabaseServer } from "@/lib/supabase";
import type { Recipe } from "@/lib/types";
import { ensureClientId } from "@/lib/user";
import { getHostedAccess, hostedAccessResponse, usesLocalModelConfig } from "@/lib/supabase-auth";

function clientIdFromRequest(request: Request) {
  const cookieHeader = request.headers.get("cookie") || "";
  return ensureClientId(/(?:^|; )client_id=([^;]+)/.exec(cookieHeader)?.[1]);
}

async function readRecipe(request: Request, recipeId: string): Promise<Recipe | null> {
  const supabase = supabaseServer();
  if (!supabase) return null;
  const clientId = clientIdFromRequest(request);
  const { data, error } = await supabase.from("recipes").select("*").eq("id", recipeId).or(`is_public.eq.true,client_id.eq.${clientId}`).maybeSingle();
  if (error || !data) return null;
  return normalizeRecipe(data);
}

export async function POST(request: Request) {
  let rawBody: unknown;
  try { rawBody = await request.json(); } catch { rawBody = {}; }
  const parsed = recipeAskRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "INVALID_REQUEST", message: parsed.error.issues[0]?.message || "菜谱问题参数不合法", details: parsed.error.flatten() } }, { status: 400 });
  }

  if (!usesLocalModelConfig(parsed.data.model_config)) {
    const access = await getHostedAccess(request);
    if (!access.allowed) return hostedAccessResponse(access);
  }

  const recipe = parsed.data.recipe_id
    ? await readRecipe(request, parsed.data.recipe_id)
    : parsed.data.recipe
      ? normalizeRecipe(parsed.data.recipe)
      : null;
  if (!recipe) return NextResponse.json({ error: { code: "RECIPE_NOT_FOUND", message: "没有找到可访问的食谱" } }, { status: 404 });

  const result = await answerRecipeQuestion({
    recipe,
    question: parsed.data.question,
    questionType: parsed.data.question_type,
    dinersCount: parsed.data.diners_count,
    availableIngredients: parsed.data.available_ingredients,
    modelConfig: parsed.data.model_config,
  });
  return NextResponse.json({ ...result.response, generation: { source: result.source, warning: result.warning } });
}
