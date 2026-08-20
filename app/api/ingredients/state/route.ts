import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase";
import { ensureClientId } from "@/lib/user";

const itemStateSchema = z.enum(["pending", "purchased", "owned"]);

const shoppingStateRequestSchema = z.object({
  menu_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const shoppingStateSaveSchema = shoppingStateRequestSchema.extend({
  menu_fingerprint: z.string().max(1000).default(""),
  item_states: z.record(z.string(), itemStateSchema).default({}),
  collapsed_categories: z.array(z.string()).default([]),
});

function clientIdCookie(clientId: string) {
  return `client_id=${clientId}; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 365}`;
}

function readClientId(request: Request) {
  const cookieHeader = request.headers.get("cookie") || "";
  const clientIdCookieValue = /(?:^|; )client_id=([^;]+)/.exec(cookieHeader)?.[1];
  return ensureClientId(clientIdCookieValue);
}

export async function GET(request: Request) {
  const clientId = readClientId(request);
  const supabase = supabaseServer();
  const url = new URL(request.url);
  const parsed = shoppingStateRequestSchema.safeParse({
    menu_start: url.searchParams.get("menu_start"),
    date_from: url.searchParams.get("date_from"),
    date_to: url.searchParams.get("date_to"),
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "采购状态参数不合法", details: parsed.error.flatten() } },
      { status: 400, headers: { "Set-Cookie": clientIdCookie(clientId) } }
    );
  }

  if (!supabase) {
    return NextResponse.json(
      { clientId, state: null, localOnly: true },
      { status: 200, headers: { "Set-Cookie": clientIdCookie(clientId) } }
    );
  }

  const { data, error } = await supabase
    .from("shopping_list_states")
    .select("*")
    .eq("client_id", clientId)
    .eq("menu_start", parsed.data.menu_start)
    .eq("date_from", parsed.data.date_from)
    .eq("date_to", parsed.data.date_to)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: { code: "DATABASE_ERROR", message: "数据库操作失败，请稍后重试" } },
      { status: 500, headers: { "Set-Cookie": clientIdCookie(clientId) } }
    );
  }

  return NextResponse.json(
    { clientId, state: data || null },
    { status: 200, headers: { "Set-Cookie": clientIdCookie(clientId) } }
  );
}

export async function PUT(request: Request) {
  const clientId = readClientId(request);
  const supabase = supabaseServer();
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {}

  const parsed = shoppingStateSaveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "采购状态保存参数不合法", details: parsed.error.flatten() } },
      { status: 400, headers: { "Set-Cookie": clientIdCookie(clientId) } }
    );
  }

  if (!supabase) {
    return NextResponse.json(
      { clientId, saved: false, localOnly: true },
      { status: 200, headers: { "Set-Cookie": clientIdCookie(clientId) } }
    );
  }

  const { data, error } = await supabase
    .from("shopping_list_states")
    .upsert({
      client_id: clientId,
      menu_start: parsed.data.menu_start,
      date_from: parsed.data.date_from,
      date_to: parsed.data.date_to,
      menu_fingerprint: parsed.data.menu_fingerprint,
      item_states: parsed.data.item_states,
      collapsed_categories: parsed.data.collapsed_categories,
      updated_at: new Date().toISOString(),
    }, { onConflict: "client_id,menu_start,date_from,date_to" })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json(
      { error: { code: "DATABASE_ERROR", message: "数据库操作失败，请稍后重试" } },
      { status: 500, headers: { "Set-Cookie": clientIdCookie(clientId) } }
    );
  }

  return NextResponse.json(
    { clientId, saved: true, state: data },
    { status: 200, headers: { "Set-Cookie": clientIdCookie(clientId) } }
  );
}
