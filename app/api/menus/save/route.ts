import { NextResponse } from "next/server";
import { writeProductEvent } from "@/lib/analytics/product-events";
import { getMenuStartDate, normalizeMenu } from "@/lib/domain/menu";
import { supabaseServer } from "@/lib/supabase";
import { ensureClientId } from "@/lib/user";
import type { Menu } from "@/lib/types";

export async function POST(request: Request) {
  const cookieHeader = request.headers.get("cookie") || "";
  const clientIdCookie = /(?:^|; )client_id=([^;]+)/.exec(cookieHeader)?.[1];
  const clientId = ensureClientId(clientIdCookie);
  const supabase = supabaseServer();

  let menu: Menu | null = null;
  try {
    const body = await request.json();
    menu = body?.menu;
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  if (!menu || !menu.days || (!menu.week_start && !menu.start_date)) {
    return NextResponse.json(
      { error: "Menu data is required" },
      { status: 400 }
    );
  }
  const normalizedMenu = normalizeMenu(menu);
  const startDate = getMenuStartDate(normalizedMenu);

  if (!supabase) {
    return NextResponse.json(
      { error: "数据库未配置，当前只能生成和查看菜单；如需保存历史菜单，请配置 Supabase。" },
      { status: 500 }
    );
  }

  const { error } = await supabase
    .from("menus")
    .upsert({
      client_id: clientId,
      week_start: normalizedMenu.week_start,
      start_date: startDate,
      end_date: normalizedMenu.end_date,
      period_type: normalizedMenu.period_type || "week",
      schema_version: normalizedMenu.schema_version || 2,
      data: normalizedMenu,
    }, { onConflict: "client_id,start_date" });

  if (error) {
    const { error: fallbackError } = await supabase
      .from("menus")
      .upsert({
        client_id: clientId,
        week_start: normalizedMenu.week_start,
        data: normalizedMenu,
      });

    if (fallbackError) {
      return NextResponse.json(
        { error: fallbackError.message },
        { status: 500 }
      );
    }
  }

  await writeProductEvent(supabase, {
    clientId,
    eventName: "menu_saved",
    properties: {
      edited: true,
      replaced_count: 0,
    },
  });

  return NextResponse.json(
    { clientId, saved: true, menu: normalizedMenu },
    { status: 200, headers: {
      "Set-Cookie": `client_id=${clientId}; Path=/; SameSite=Lax; Max-Age=${60*60*24*365}`,
    }}
  );
}
