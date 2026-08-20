import { NextResponse } from "next/server";
import { isSupabaseConnectionError, supabaseServer, withSupabaseTimeout } from "@/lib/supabase";
import { ensureClientId } from "@/lib/user";
import type { Preferences } from "@/lib/types";

function readPrefsFromCookie(cookieHeader: string): Preferences | null {
  const m = /(?:^|; )prefs=([^;]+)/.exec(cookieHeader);
  if (!m) return null;
  try {
    const raw = decodeURIComponent(m[1]);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writePrefsCookie(prefs: Preferences) {
  const raw = encodeURIComponent(JSON.stringify(prefs));
  // 约 4KB 限制，当前字段较小，足够
  return `prefs=${raw}; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 365}`;
}

function clientIdCookie(clientId: string) {
  return `client_id=${clientId}; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 365}`;
}

function localPreferencesResponse(clientId: string, prefs: Preferences | null, warning?: string) {
  const response = NextResponse.json(
    { clientId, preferences: prefs, saved: !!prefs, localOnly: true, warning },
    { status: 200 }
  );
  response.headers.append("Set-Cookie", clientIdCookie(clientId));
  if (prefs) response.headers.append("Set-Cookie", writePrefsCookie(prefs));
  return response;
}

export async function GET(request: Request) {
  const cookieHeader = request.headers.get("cookie") || "";
  const clientIdCookie = /(?:^|; )client_id=([^;]+)/.exec(cookieHeader)?.[1];
  const clientId = ensureClientId(clientIdCookie);

  const supabase = supabaseServer();
  if (!supabase) {
    return localPreferencesResponse(clientId, readPrefsFromCookie(cookieHeader));
  }

  const query = supabase.from("preferences").select("*").eq("client_id", clientId).maybeSingle();
  let result: Awaited<typeof query>;
  try {
    result = await withSupabaseTimeout(query);
  } catch (error) {
    if (isSupabaseConnectionError(error)) {
      return localPreferencesResponse(
        clientId,
        readPrefsFromCookie(cookieHeader),
        "服务端偏好暂时不可用，已使用当前浏览器保存的偏好。"
      );
    }
    throw error;
  }
  const { data, error } = result;

  if (error) {
    if (isSupabaseConnectionError(error)) {
      return localPreferencesResponse(
        clientId,
        readPrefsFromCookie(cookieHeader),
        "服务端偏好暂时不可用，已使用当前浏览器保存的偏好。"
      );
    }
    return NextResponse.json({ error: "数据库操作失败，请稍后重试" }, { status: 500 });
  }

  return NextResponse.json(
    { clientId, preferences: data ?? null },
    { status: 200, headers: {
      "Set-Cookie": `client_id=${clientId}; Path=/; SameSite=Lax; Max-Age=${60*60*24*365}`,
    } }
  );
}

export async function POST(request: Request) {
  const body = await request.json();
  const {
    cuisines,
    dietaryRestrictions,
    dislikedIngredients,
    halal,
    lightMeal,
    specialGroup,
    energyDisplay,
    days,
    dinersCount,
    dishesPerMeal,
    mealCount,
    healthGoal,
    budgetLevel,
    cookingTimeLimit,
  } = body || {};

  const cookieHeader = request.headers.get("cookie") || "";
  const clientIdCookie = /(?:^|; )client_id=([^;]+)/.exec(cookieHeader)?.[1];
  const clientId = ensureClientId(clientIdCookie);

  const prefs: Preferences = {
    cuisines,
    dietary_restrictions: dietaryRestrictions,
    disliked_ingredients: dislikedIngredients,
    halal: !!halal,
    light_meal: !!lightMeal,
    special_group: specialGroup ?? null,
    energy_display: energyDisplay ?? "auto",
    days: days === 5 ? 5 : 7,
    meal_count: typeof mealCount === "number" ? Math.max(1, Math.min(6, Math.round(mealCount))) : undefined,
    diners_count: typeof dinersCount === "number" ? Math.max(1, Math.min(20, Math.round(dinersCount))) : undefined,
    dishes_per_meal: typeof dishesPerMeal === "number" ? Math.max(1, Math.min(6, Math.round(dishesPerMeal))) : undefined,
    health_goal: healthGoal ?? "balanced",
    budget_level: budgetLevel ?? "medium",
    cooking_time_limit: typeof cookingTimeLimit === "number" ? Math.max(10, Math.min(180, Math.round(cookingTimeLimit))) : undefined,
  };

  const supabase = supabaseServer();
  if (!supabase) {
    return localPreferencesResponse(clientId, prefs);
  }

  const richPayload = {
    client_id: clientId,
    cuisines,
    dietary_restrictions: dietaryRestrictions,
    disliked_ingredients: dislikedIngredients,
    halal: !!halal,
    light_meal: !!lightMeal,
    special_group: specialGroup ?? null,
    energy_display: energyDisplay ?? "auto",
    days: days === 5 ? 5 : 7,
    meal_count: typeof mealCount === "number" ? Math.max(1, Math.min(6, Math.round(mealCount))) : 3,
    diners_count: typeof dinersCount === "number" ? Math.max(1, Math.min(20, Math.round(dinersCount))) : null,
    dishes_per_meal: typeof dishesPerMeal === "number" ? Math.max(1, Math.min(6, Math.round(dishesPerMeal))) : 1,
    health_goal: healthGoal ?? "balanced",
    budget_level: budgetLevel ?? "medium",
    cooking_time_limit: typeof cookingTimeLimit === "number" ? Math.max(10, Math.min(180, Math.round(cookingTimeLimit))) : null,
  };

  const richSave = supabase.from("preferences").upsert(richPayload, { onConflict: "client_id" }).select("*").maybeSingle();
  let richResult: Awaited<typeof richSave>;
  try {
    richResult = await withSupabaseTimeout(richSave);
  } catch (error) {
    if (isSupabaseConnectionError(error)) {
      return localPreferencesResponse(clientId, prefs, "服务端偏好暂时不可用，本次修改已保存到当前浏览器。");
    }
    throw error;
  }
  let { data, error } = richResult;

  if (error) {
    if (isSupabaseConnectionError(error)) {
      return localPreferencesResponse(
        clientId,
        prefs,
        "服务端偏好暂时不可用，本次修改已保存到当前浏览器。"
      );
    }
    const fallbackPayload = {
      client_id: clientId,
      cuisines,
      dietary_restrictions: dietaryRestrictions,
      disliked_ingredients: dislikedIngredients,
      halal: !!halal,
      light_meal: !!lightMeal,
      special_group: specialGroup ?? null,
      energy_display: energyDisplay ?? "auto",
      days: days === 5 ? 5 : 7,
      diners_count: typeof dinersCount === "number" ? Math.max(1, Math.min(20, Math.round(dinersCount))) : null,
      dishes_per_meal: typeof dishesPerMeal === "number" ? Math.max(1, Math.min(6, Math.round(dishesPerMeal))) : 1,
    };
    const fallbackSave = supabase.from("preferences").upsert(fallbackPayload, { onConflict: "client_id" }).select("*").maybeSingle();
    let fallback: Awaited<typeof fallbackSave>;
    try {
      fallback = await withSupabaseTimeout(fallbackSave);
    } catch (fallbackError) {
      if (isSupabaseConnectionError(fallbackError)) {
        return localPreferencesResponse(clientId, prefs, "服务端偏好暂时不可用，本次修改已保存到当前浏览器。");
      }
      throw fallbackError;
    }
    data = fallback.data ? { ...fallback.data, ...prefs } : prefs;
    error = fallback.error;
  }

  if (error) {
    if (isSupabaseConnectionError(error)) {
      return localPreferencesResponse(
        clientId,
        prefs,
        "服务端偏好暂时不可用，本次修改已保存到当前浏览器。"
      );
    }
    return NextResponse.json({ error: "数据库操作失败，请稍后重试" }, { status: 500 });
  }

  return NextResponse.json(
    { clientId, saved: true, preferences: data },
    { status: 200, headers: {
      "Set-Cookie": `client_id=${clientId}; Path=/; SameSite=Lax; Max-Age=${60*60*24*365}`,
    } }
  );
}
