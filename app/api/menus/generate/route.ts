import { NextResponse } from "next/server";
import { countMenuDishes, writeProductEvent } from "@/lib/analytics/product-events";
import { writeMenuGenerationLog } from "@/lib/ai/menu-generation-log";
import { generateMenu, weekStart } from "@/lib/ai/menu-generator";
import { buildDishFeedbackSummary, mergeDishFeedbackSummaries } from "@/lib/domain/dish-feedback";
import { getMenuStartDate, normalizeMenu } from "@/lib/domain/menu";
import { menuGenerationParameterSnapshot, resolveMenuGenerationPreferences } from "@/lib/domain/menu-generation-request";
import { readDishFeedbackEntries } from "@/lib/dish-feedback-store";
import { generateMenuRequestSchema } from "@/lib/schemas/menu";
import { isSupabaseConnectionError, supabaseServer, withSupabaseTimeout } from "@/lib/supabase";
import type { Preferences } from "@/lib/types";
import { ensureClientId } from "@/lib/user";
import { getHostedAccess, hostedAccessResponse, usesLocalModelConfig } from "@/lib/supabase-auth";

// Align the platform function budget with the internal AI timeout (up to 90s for
// 7-day menus). Without this the route runs at the platform default (~10-15s on
// Vercel) and is killed long before generation can finish, so every fallback to
// this direct path failed. Matches the background job route's maxDuration.
export const maxDuration = 300;

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

function clientIdCookie(clientId: string) {
  return `client_id=${clientId}; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 365}`;
}

async function findCachedMenu(
  supabase: NonNullable<ReturnType<typeof supabaseServer>>,
  clientId: string,
  startDate: string
) {
  const byStartDate = await withSupabaseTimeout(
    supabase
      .from("menus")
      .select("*")
      .eq("client_id", clientId)
      .eq("start_date", startDate)
      .maybeSingle()
  );

  if (!byStartDate.error && byStartDate.data) return byStartDate;

  return withSupabaseTimeout(
    supabase
      .from("menus")
      .select("*")
      .eq("client_id", clientId)
      .eq("week_start", startDate)
      .maybeSingle()
  );
}

export async function POST(request: Request) {
  const cookieHeader = request.headers.get("cookie") || "";
  const clientIdCookieValue = /(?:^|; )client_id=([^;]+)/.exec(cookieHeader)?.[1];
  const clientId = ensureClientId(clientIdCookieValue);
  const supabase = supabaseServer();

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {}

  const parsedBody = generateMenuRequestSchema.safeParse(body);
  if (!parsedBody.success) {
    await writeProductEvent(supabase, {
      clientId,
      eventName: "generation_failed",
      properties: {
        error_type: "invalid_request",
        stage: "request_validation",
        is_retry: false,
      },
    });
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "生成菜单参数不合法", details: parsedBody.error.flatten() } },
      { status: 400, headers: { "Set-Cookie": clientIdCookie(clientId) } }
    );
  }
  if (!usesLocalModelConfig(parsedBody.data.model_config)) {
    const access = await getHostedAccess(request);
    if (!access.allowed) return hostedAccessResponse(access);
  }

  const startDate = parsedBody.data.start_date || weekStart();

  const generationStartedEvent = writeProductEvent(supabase, {
    clientId,
    eventName: "generation_started",
    properties: {
      days: parsedBody.data.days || 7,
      meal_count: parsedBody.data.mealCount || 3,
      diners_count: parsedBody.data.diners_count || 1,
      scenario: parsedBody.data.scenario || "daily_home",
    },
  });



  if (supabase && !parsedBody.data.force_regenerate) {
    const { data: cached, error: cacheError } = await findCachedMenu(supabase, clientId, startDate).catch((error) => ({
      data: null,
      error: { message: error instanceof Error ? error.message : String(error) },
    }));

    if (!cacheError && cached?.data) {
      const menu = normalizeMenu(cached.data);
      const menuStartDate = getMenuStartDate(menu);
      await writeMenuGenerationLog(supabase, {
        clientId,
        startDate: menuStartDate,
        status: "cache",
        source: cached.source || "cache",
      });
      await writeProductEvent(supabase, {
        clientId,
        eventName: "generation_completed",
        properties: {
          source: cached.source || "cache",
          duration_ms: 0,
          warning_count: 0,
          dish_count: countMenuDishes(menu),
        },
      });
      return NextResponse.json(
        {
          clientId,
          start_date: menuStartDate,
          week_start: menu.week_start,
          menu,
          source: cached.source || "cache",
          warnings: [],
        },
        { status: 200, headers: { "Set-Cookie": clientIdCookie(clientId) } }
      );
    }
  }

  const databasePrefsPromise = supabase
    ? withSupabaseTimeout(supabase.from("preferences").select("*").eq("client_id", clientId).maybeSingle())
      .then(({ data }) => data as Preferences | null)
      .catch(() => null)
    : Promise.resolve(null);
  const storedFeedbackPromise = supabase
    ? readDishFeedbackEntries(supabase, clientId).catch(() => ({ entries: [] }))
    : Promise.resolve({ entries: [] });
  const [databasePrefs, storedFeedback] = await Promise.all([
    databasePrefsPromise,
    storedFeedbackPromise,
    generationStartedEvent,
  ]).then(([prefs, feedback]) => [prefs, feedback] as const);
  let storedPrefs = databasePrefs;
  if (!storedPrefs) {
    storedPrefs = readPrefsFromCookie(cookieHeader);
  }

  const finalPrefs = resolveMenuGenerationPreferences(storedPrefs, parsedBody.data);
  const parameterSnapshot = menuGenerationParameterSnapshot(finalPrefs, startDate);
  const mealCount = finalPrefs.meal_count!;
  const daysCount = finalPrefs.days!;
  const dishesPerMeal = finalPrefs.dishes_per_meal!;
  console.info(JSON.stringify({ scope: "menu_generation_parameters", mode: "direct", ...parameterSnapshot }));
  const showEnergy =
    finalPrefs.energy_display === "on" ||
    (finalPrefs.energy_display === "auto" && (!!finalPrefs.light_meal || finalPrefs.health_goal !== "balanced"));
  const feedbackSummary = mergeDishFeedbackSummaries(
    parsedBody.data.feedback_summary,
    buildDishFeedbackSummary(storedFeedback.entries)
  );

  let result: Awaited<ReturnType<typeof generateMenu>>;
  try {
    result = await generateMenu(finalPrefs, {
      startDate,
      mealCount,
      daysCount,
      dishesPerMeal,
      scenario: finalPrefs.scenario,
      festivalType: finalPrefs.festival_type,
      festivalTheme: finalPrefs.festival_theme,
      feedbackSummary,
      modelConfig: parsedBody.data.model_config,
    });
  } catch (error) {
    await writeProductEvent(supabase, {
      clientId,
      eventName: "generation_failed",
      properties: {
        error_type: error instanceof Error ? error.name : "unknown",
        stage: "generate_menu",
        is_retry: false,
      },
    });
    throw error;
  }

  if (supabase) {
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
  }
  const generationStatus = result.source === "sample"
    ? "fallback"
    : result.meta.attempts.some((attempt) => attempt.attempt === "repair" && attempt.ok)
      ? "repaired"
      : "success";

  await writeMenuGenerationLog(supabase, {
    clientId,
    startDate: getMenuStartDate(result.menu),
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

  return NextResponse.json(
    {
      clientId,
      start_date: startDate,
      week_start: startDate,
      menu: result.menu,
      source: result.source,
      warnings: result.warnings,
      showEnergy,
      generation: result.meta,
    },
    { status: 200, headers: { "Set-Cookie": clientIdCookie(clientId) } }
  );
}

export async function GET(request: Request) {
  const cookieHeader = request.headers.get("cookie") || "";
  const clientIdCookieValue = /(?:^|; )client_id=([^;]+)/.exec(cookieHeader)?.[1];
  const clientId = ensureClientId(clientIdCookieValue);
  const supabase = supabaseServer();

  if (!supabase) {
    return NextResponse.json(
      { clientId, menus: [] },
      { status: 200, headers: { "Set-Cookie": clientIdCookie(clientId) } }
    );
  }

  const query = supabase
    .from("menus")
    .select("*")
    .eq("client_id", clientId)
    .order("week_start", { ascending: false });
  let queryResult: Awaited<typeof query>;
  try {
    queryResult = await withSupabaseTimeout(query);
  } catch (error) {
    if (isSupabaseConnectionError(error)) {
      console.warn(JSON.stringify({ scope: "menu_history", status: "local_only", client_id: clientId, error: error instanceof Error ? error.message : String(error) }));
      return NextResponse.json(
        { clientId, menus: [], localOnly: true, warning: "服务端历史菜单暂时不可用，已切换为本浏览器菜单。" },
        { status: 200, headers: { "Set-Cookie": clientIdCookie(clientId) } }
      );
    }
    throw error;
  }
  const { data, error } = queryResult;

  if (error) {
    if (isSupabaseConnectionError(error)) {
      console.warn(JSON.stringify({
        scope: "menu_history",
        status: "local_only",
        client_id: clientId,
        error: error.message,
      }));
      return NextResponse.json(
        {
          clientId,
          menus: [],
          localOnly: true,
          warning: "服务端历史菜单暂时不可用，已切换为本浏览器菜单。",
        },
        { status: 200, headers: { "Set-Cookie": clientIdCookie(clientId) } }
      );
    }
    return NextResponse.json({ error: { code: "DATABASE_ERROR", message: "数据库操作失败，请稍后重试" } }, { status: 500 });
  }

  const menus = (data || []).map((record) => ({
    ...record,
    data: normalizeMenu(record.data),
  }));

  return NextResponse.json(
    { clientId, menus },
    { status: 200, headers: { "Set-Cookie": clientIdCookie(clientId) } }
  );
}
