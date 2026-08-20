import { NextResponse } from "next/server";
import { z } from "zod";
import { writeProductEvent } from "@/lib/analytics/product-events";
import { applyDishFeedbackEntry, buildDishFeedbackSummary, normalizeDishFeedbackName } from "@/lib/domain/dish-feedback";
import { isMissingTableError, readDishFeedbackEntries } from "@/lib/dish-feedback-store";
import { isSupabaseConnectionError, supabaseServer, withSupabaseTimeout } from "@/lib/supabase";
import type { DishFeedbackEntry } from "@/lib/types";
import { ensureClientId } from "@/lib/user";

const feedbackSchema = z.object({
  dish_name: z.string().trim().min(1).max(120),
  feedback: z.enum(["liked", "blocked", "cooked"]),
  active: z.boolean().default(true),
  source_menu_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

function clientIdCookie(clientId: string) {
  return `client_id=${clientId}; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 365}`;
}

function getClientId(request: Request) {
  const cookieHeader = request.headers.get("cookie") || "";
  const clientIdCookieValue = /(?:^|; )client_id=([^;]+)/.exec(cookieHeader)?.[1];
  return ensureClientId(clientIdCookieValue);
}

export async function GET(request: Request) {
  const clientId = getClientId(request);
  const supabase = supabaseServer();

  try {
    const { entries, localOnly } = await readDishFeedbackEntries(supabase, clientId);
    return NextResponse.json(
      { clientId, feedback: entries, summary: buildDishFeedbackSummary(entries), localOnly },
      { status: 200, headers: { "Set-Cookie": clientIdCookie(clientId) } }
    );
  } catch (error) {
    if (isSupabaseConnectionError(error)) {
      return NextResponse.json(
        {
          clientId,
          feedback: [],
          summary: buildDishFeedbackSummary([]),
          localOnly: true,
          warning: "服务端反馈暂时不可用，已继续使用当前浏览器反馈。",
        },
        { status: 200, headers: { "Set-Cookie": clientIdCookie(clientId) } }
      );
    }
    return NextResponse.json(
      { error: { code: "DATABASE_ERROR", message: "读取菜品反馈失败" } },
      { status: 500, headers: { "Set-Cookie": clientIdCookie(clientId) } }
    );
  }
}

export async function PUT(request: Request) {
  const clientId = getClientId(request);
  const supabase = supabaseServer();

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {}

  const parsed = feedbackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "菜品反馈参数不合法", details: parsed.error.flatten() } },
      { status: 400, headers: { "Set-Cookie": clientIdCookie(clientId) } }
    );
  }

  const data = parsed.data;
  const dishKey = normalizeDishFeedbackName(data.dish_name);
  const currentEntry: DishFeedbackEntry = {
    client_id: clientId,
    dish_name: data.dish_name,
    dish_key: dishKey,
    source_menu_start: data.source_menu_start ?? null,
  };
  const nextEntry = applyDishFeedbackEntry([currentEntry], {
    dish_name: data.dish_name,
    feedback: data.feedback,
    active: data.active,
    source_menu_start: data.source_menu_start ?? null,
  })[0] || { ...currentEntry, liked: false, blocked: false, cooked: false };

  if (!supabase) {
    return NextResponse.json(
      { clientId, localOnly: true, feedback: nextEntry },
      { status: 200, headers: { "Set-Cookie": clientIdCookie(clientId) } }
    );
  }

  try {
    const { data: existing, error: existingError } = await withSupabaseTimeout(
      supabase
        .from("dish_feedback")
        .select("*")
        .eq("client_id", clientId)
        .eq("dish_key", dishKey)
        .maybeSingle()
    );

    if (existingError && !isMissingTableError(existingError)) throw existingError;
    if (existingError && isMissingTableError(existingError)) {
      return NextResponse.json(
        { clientId, localOnly: true, feedback: nextEntry },
        { status: 200, headers: { "Set-Cookie": clientIdCookie(clientId) } }
      );
    }

    const merged = applyDishFeedbackEntry(existing ? [existing as DishFeedbackEntry] : [currentEntry], {
      dish_name: data.dish_name,
      feedback: data.feedback,
      active: data.active,
      source_menu_start: data.source_menu_start ?? (existing as DishFeedbackEntry | null)?.source_menu_start ?? null,
    })[0] || {
      ...(existing as DishFeedbackEntry | null || currentEntry),
      liked: false,
      blocked: false,
      cooked: false,
      updated_at: new Date().toISOString(),
    };

    const { data: saved, error: saveError } = await withSupabaseTimeout(
      supabase
        .from("dish_feedback")
        .upsert({
          client_id: clientId,
          dish_name: merged.dish_name,
          dish_key: merged.dish_key,
          liked: !!merged.liked,
          blocked: !!merged.blocked,
          cooked: !!merged.cooked,
          source_menu_start: merged.source_menu_start ?? null,
          updated_at: new Date().toISOString(),
        }, { onConflict: "client_id,dish_key" })
        .select("*")
        .single()
    );

    if (saveError) {
      if (isMissingTableError(saveError)) {
        return NextResponse.json(
          { clientId, localOnly: true, feedback: merged },
          { status: 200, headers: { "Set-Cookie": clientIdCookie(clientId) } }
        );
      }
      throw saveError;
    }

    await writeProductEvent(supabase, {
      clientId,
      eventName: "dish_feedback_submitted",
      properties: {
        feedback: data.active ? data.feedback : `un${data.feedback}`,
        source_menu_id: data.source_menu_start || "",
      },
    });

    return NextResponse.json(
      { clientId, localOnly: false, feedback: saved },
      { status: 200, headers: { "Set-Cookie": clientIdCookie(clientId) } }
    );
  } catch (error) {
    if (isSupabaseConnectionError(error)) {
      return NextResponse.json(
        {
          clientId,
          localOnly: true,
          feedback: nextEntry,
          warning: "服务端反馈暂时不可用，本次反馈仅保存在当前浏览器。",
        },
        { status: 200, headers: { "Set-Cookie": clientIdCookie(clientId) } }
      );
    }
    return NextResponse.json(
      { error: { code: "DATABASE_ERROR", message: "保存菜品反馈失败" } },
      { status: 500, headers: { "Set-Cookie": clientIdCookie(clientId) } }
    );
  }
}
