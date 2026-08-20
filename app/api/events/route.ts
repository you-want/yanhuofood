import { NextResponse } from "next/server";
import { FUNNEL_STEPS, sanitizeProductEvent } from "@/lib/analytics/product-events";
import { supabaseServer } from "@/lib/supabase";
import { ensureClientId } from "@/lib/user";

function clientIdCookie(clientId: string) {
  return `client_id=${clientId}; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 365}`;
}

function getClientId(request: Request) {
  const cookieHeader = request.headers.get("cookie") || "";
  const clientIdCookieValue = /(?:^|; )client_id=([^;]+)/.exec(cookieHeader)?.[1];
  return ensureClientId(clientIdCookieValue);
}

export async function POST(request: Request) {
  const clientId = getClientId(request);
  const supabase = supabaseServer();

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400, headers: { "Set-Cookie": clientIdCookie(clientId) } }
    );
  }

  const source = body && typeof body === "object" ? body as { event?: unknown; properties?: unknown } : {};
  const event = typeof source.event === "string" ? sanitizeProductEvent(source.event, source.properties) : null;

  if (!event) {
    return NextResponse.json(
      { error: "Unsupported event" },
      { status: 400, headers: { "Set-Cookie": clientIdCookie(clientId) } }
    );
  }

  if (!supabase) {
    return NextResponse.json(
      { clientId, recorded: false, reason: "database_not_configured" },
      { status: 200, headers: { "Set-Cookie": clientIdCookie(clientId) } }
    );
  }

  const { error } = await supabase.from("product_events").insert({
    client_id: clientId,
    event_name: event.eventName,
    properties: event.properties,
  });

  if (error) {
    return NextResponse.json(
      { error: "数据库操作失败" },
      { status: 500, headers: { "Set-Cookie": clientIdCookie(clientId) } }
    );
  }

  return NextResponse.json(
    { clientId, recorded: true },
    { status: 200, headers: { "Set-Cookie": clientIdCookie(clientId) } }
  );
}

export async function GET(request: Request) {
  const clientId = getClientId(request);
  const supabase = supabaseServer();

  if (!supabase) {
    return NextResponse.json(
      { clientId, events: [], funnel: FUNNEL_STEPS.map((event) => ({ event, count: 0 })) },
      { status: 200, headers: { "Set-Cookie": clientIdCookie(clientId) } }
    );
  }

  const { data, error } = await supabase
    .from("product_events")
    .select("event_name,properties,created_at")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    return NextResponse.json(
      { error: "数据库操作失败" },
      { status: 500, headers: { "Set-Cookie": clientIdCookie(clientId) } }
    );
  }

  const counts = new Map<string, number>();
  for (const event of data || []) {
    counts.set(event.event_name, (counts.get(event.event_name) || 0) + 1);
  }

  return NextResponse.json(
    {
      clientId,
      events: data || [],
      funnel: FUNNEL_STEPS.map((event) => ({ event, count: counts.get(event) || 0 })),
    },
    { status: 200, headers: { "Set-Cookie": clientIdCookie(clientId) } }
  );
}
