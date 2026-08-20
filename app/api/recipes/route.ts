import { NextResponse } from "next/server";
import { normalizeRecipe, recipeKnowledgePayload } from "@/lib/domain/recipe-normalize";
import { recipeInputSchema, recipeUpdateSchema, type RecipeInput, type RecipeUpdateInput } from "@/lib/schemas/recipe";
import { supabaseServer } from "@/lib/supabase";
import type { Recipe, RecipeIngredientDetail } from "@/lib/types";
import { ensureClientId } from "@/lib/user";

const MEDIA_COLUMNS = ["image_url", "video_url", "video_search_keyword"] as const;
const KNOWLEDGE_COLUMNS = [
  "source_url", "servings", "cooking_time_minutes", "prep_time_minutes", "difficulty",
  "ingredient_details", "steps", "seasonings", "nutrition", "equipment", "dietary_flags",
  "health_goals", "meal_types", "schema_version", "quality_status",
] as const;

function clientIdCookie(clientId: string) {
  return `client_id=${clientId}; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 365}`;
}

function getClientId(request: Request) {
  const cookieHeader = request.headers.get("cookie") || "";
  const clientIdCookieValue = /(?:^|; )client_id=([^;]+)/.exec(cookieHeader)?.[1];
  return ensureClientId(clientIdCookieValue);
}

function columnsUnavailable(error: { code?: string; message?: string } | null, columns: readonly string[]) {
  if (!error) return false;
  const message = `${error.code || ""} ${error.message || ""}`.toLowerCase();
  return columns.some((column) => message.includes(column)) && (
    message.includes("column") || message.includes("schema cache") || message.includes("pgrst204") || message.includes("42703")
  );
}

function validationError(message: string, clientId: string) {
  return NextResponse.json({ error: message }, { status: 400, headers: { "Set-Cookie": clientIdCookie(clientId) } });
}

function mediaPayload(input: Partial<RecipeInput>) {
  return {
    image_url: input.image_url ?? null,
    video_url: input.video_url ?? null,
    video_search_keyword: input.video_search_keyword ?? null,
  };
}

function baseCreatePayload(input: RecipeInput, clientId: string) {
  return {
    client_id: clientId,
    is_public: false,
    name: input.name,
    cuisine: input.cuisine,
    calories: input.calories,
    ingredients: input.ingredients,
    instructions: input.instructions,
    tags: input.tags,
  };
}

function baseUpdatePayload(input: RecipeUpdateInput) {
  return Object.fromEntries(Object.entries({
    name: input.name,
    cuisine: input.cuisine,
    calories: input.calories,
    ingredients: input.ingredients,
    instructions: input.instructions,
    tags: input.tags,
  }).filter(([, value]) => value !== undefined));
}

function knowledgeCreatePayload(input: RecipeInput) {
  return { ...recipeKnowledgePayload(input as Partial<Recipe>), source_url: input.source_url ?? null };
}

function knowledgeUpdatePayload(input: RecipeUpdateInput) {
  const raw: Record<string, unknown> = {};
  const directFields = [
    "source_url", "servings", "cooking_time_minutes", "prep_time_minutes", "difficulty", "seasonings",
    "nutrition", "equipment", "dietary_flags", "health_goals", "meal_types", "quality_status",
  ] as const;
  for (const field of directFields) if (input[field] !== undefined) raw[field] = input[field];
  if (input.ingredient_details !== undefined || input.ingredients !== undefined) {
    raw.ingredient_details = recipeKnowledgePayload(input as Partial<Recipe>).ingredient_details;
  }
  if (input.steps !== undefined || input.instructions !== undefined) {
    raw.steps = recipeKnowledgePayload(input as Partial<Recipe>).steps;
  }
  if (Object.keys(raw).length) raw.schema_version = 2;
  return raw;
}

async function syncRecipeIngredients(
  supabase: NonNullable<ReturnType<typeof supabaseServer>>,
  recipeId: string,
  ingredients: RecipeIngredientDetail[],
  seasonings: RecipeIngredientDetail[]
) {
  const rows = [
    ...ingredients.map((item, position) => ({ recipe_id: recipeId, position, ...item, is_seasoning: false })),
    ...seasonings.map((item, position) => ({ recipe_id: recipeId, position, ...item, is_seasoning: true, category: item.category || "seasoning" })),
  ];
  try {
    const deleted = await supabase.from("recipe_ingredients").delete().eq("recipe_id", recipeId);
    if (deleted.error || !rows.length) return;
    const inserted = await supabase.from("recipe_ingredients").insert(rows);
    if (inserted.error) console.warn(JSON.stringify({ scope: "recipe_ingredients", action: "insert", recipe_id: recipeId, error: inserted.error.message }));
  } catch (error) {
    console.warn(JSON.stringify({ scope: "recipe_ingredients", action: "sync", recipe_id: recipeId, error: error instanceof Error ? error.message : String(error) }));
  }
}

export async function GET(request: Request) {
  const clientId = getClientId(request);
  const supabase = supabaseServer();
  if (!supabase) {
    const recipes = [
      { id: "demo-1", is_public: true, name: "番茄牛腩", cuisine: "中式", calories: 620 },
      { id: "demo-2", is_public: true, name: "宫保鸡丁", cuisine: "中式", calories: 580 },
      { id: "demo-3", is_public: true, name: "香煎三文鱼", cuisine: "西式", calories: 520 },
    ].map(normalizeRecipe);
    return NextResponse.json({ clientId, recipes }, { status: 200, headers: { "Set-Cookie": clientIdCookie(clientId) } });
  }

  const [publicRecipes, personalRecipes] = await Promise.all([
    supabase.from("recipes").select("*").eq("is_public", true),
    supabase.from("recipes").select("*").eq("client_id", clientId),
  ]);
  const error = publicRecipes.error || personalRecipes.error;
  if (error) return NextResponse.json({ error: "数据库操作失败，请稍后重试" }, { status: 500, headers: { "Set-Cookie": clientIdCookie(clientId) } });

  const recipes = [...(publicRecipes.data || []), ...(personalRecipes.data || [])].map(normalizeRecipe);
  return NextResponse.json({ clientId, recipes }, { status: 200, headers: { "Set-Cookie": clientIdCookie(clientId) } });
}

export async function POST(request: Request) {
  const clientId = getClientId(request);
  const supabase = supabaseServer();
  if (!supabase) return NextResponse.json({ error: "Database not available" }, { status: 500, headers: { "Set-Cookie": clientIdCookie(clientId) } });

  let rawBody: unknown;
  try { rawBody = await request.json(); } catch { return validationError("请求内容格式不正确", clientId); }
  const parsed = recipeInputSchema.safeParse(rawBody);
  if (!parsed.success) return validationError(parsed.error.issues[0]?.message || "食谱内容不正确", clientId);
  const body = parsed.data;
  const basePayload = baseCreatePayload(body, clientId);
  const fullPayload = { ...basePayload, ...mediaPayload(body), ...knowledgeCreatePayload(body) };

  let { data, error } = await supabase.from("recipes").insert(fullPayload).select("*").single();
  if (columnsUnavailable(error, KNOWLEDGE_COLUMNS)) {
    const mediaResult = await supabase.from("recipes").insert({ ...basePayload, ...mediaPayload(body) }).select("*").single();
    data = mediaResult.data;
    error = mediaResult.error;
  }
  if (columnsUnavailable(error, MEDIA_COLUMNS)) {
    const fallback = await supabase.from("recipes").insert(basePayload).select("*").single();
    data = fallback.data;
    error = fallback.error;
  }
  if (error || !data) return NextResponse.json({ error: "数据库操作失败，请稍后重试" }, { status: 500, headers: { "Set-Cookie": clientIdCookie(clientId) } });

  const recipe = normalizeRecipe({ ...data, ...mediaPayload(body), ...knowledgeCreatePayload(body) });
  await syncRecipeIngredients(supabase, recipe.id, recipe.ingredient_details || [], recipe.seasonings || []);
  return NextResponse.json({ clientId, recipe }, { status: 201, headers: { "Set-Cookie": clientIdCookie(clientId) } });
}

export async function PUT(request: Request) {
  const clientId = getClientId(request);
  const supabase = supabaseServer();
  if (!supabase) return NextResponse.json({ error: "Database not available" }, { status: 500, headers: { "Set-Cookie": clientIdCookie(clientId) } });

  let rawBody: unknown;
  try { rawBody = await request.json(); } catch { return validationError("请求内容格式不正确", clientId); }
  const parsed = recipeUpdateSchema.safeParse(rawBody);
  if (!parsed.success) return validationError(parsed.error.issues[0]?.message || "食谱内容不正确", clientId);
  const body = parsed.data;
  const basePayload = baseUpdatePayload(body);
  const mediaUpdate = Object.fromEntries(MEDIA_COLUMNS.filter((column) => body[column] !== undefined).map((column) => [column, body[column]]));
  const knowledgeUpdate = knowledgeUpdatePayload(body);

  let { data, error } = await supabase.from("recipes").update({ ...basePayload, ...mediaUpdate, ...knowledgeUpdate }).eq("id", body.id).eq("client_id", clientId).select("*").maybeSingle();
  if (columnsUnavailable(error, KNOWLEDGE_COLUMNS)) {
    const mediaResult = await supabase.from("recipes").update({ ...basePayload, ...mediaUpdate }).eq("id", body.id).eq("client_id", clientId).select("*").maybeSingle();
    data = mediaResult.data;
    error = mediaResult.error;
  }
  if (columnsUnavailable(error, MEDIA_COLUMNS)) {
    const fallback = await supabase.from("recipes").update(basePayload).eq("id", body.id).eq("client_id", clientId).select("*").maybeSingle();
    data = fallback.data;
    error = fallback.error;
  }
  if (error) return NextResponse.json({ error: "数据库操作失败，请稍后重试" }, { status: 500, headers: { "Set-Cookie": clientIdCookie(clientId) } });
  if (!data) return NextResponse.json({ error: "Recipe not found" }, { status: 404, headers: { "Set-Cookie": clientIdCookie(clientId) } });

  const recipe = normalizeRecipe({ ...data, ...mediaUpdate, ...knowledgeUpdate });
  if (body.ingredients !== undefined || body.ingredient_details !== undefined || body.seasonings !== undefined) {
    await syncRecipeIngredients(supabase, recipe.id, recipe.ingredient_details || [], recipe.seasonings || []);
  }
  return NextResponse.json({ clientId, recipe }, { status: 200, headers: { "Set-Cookie": clientIdCookie(clientId) } });
}

export async function DELETE(request: Request) {
  const clientId = getClientId(request);
  const supabase = supabaseServer();
  if (!supabase) return NextResponse.json({ error: "Database not available" }, { status: 500, headers: { "Set-Cookie": clientIdCookie(clientId) } });
  let body: { id: string } | null = null;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400, headers: { "Set-Cookie": clientIdCookie(clientId) } }); }
  if (!body?.id) return NextResponse.json({ error: "Recipe ID is required" }, { status: 400, headers: { "Set-Cookie": clientIdCookie(clientId) } });
  const { error } = await supabase.from("recipes").delete().eq("id", body.id).eq("client_id", clientId);
  if (error) return NextResponse.json({ error: "数据库操作失败，请稍后重试" }, { status: 500, headers: { "Set-Cookie": clientIdCookie(clientId) } });
  return NextResponse.json({ clientId, deleted: true }, { status: 200, headers: { "Set-Cookie": clientIdCookie(clientId) } });
}
