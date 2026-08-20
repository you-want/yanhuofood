import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { issueSupabaseSessionForUser } from "@/lib/wechat/session";
import {
  browserOwnsChallenge,
  challengeExpired,
  findChallengeById,
  markChallengeExpired,
  secureCookieOptions,
  WECHAT_LOGIN_BROWSER_COOKIE,
} from "@/lib/wechat/login-challenge";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let challengeId = "";
  try {
    const body = await request.json() as { challengeId?: string };
    challengeId = body.challengeId || "";
  } catch {
    return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "登录请求格式不正确。" } }, { status: 400 });
  }

  const supabase = supabaseServer();
  if (!supabase) {
    return NextResponse.json({ error: { code: "DATABASE_NOT_CONFIGURED", message: "服务端数据库未配置。" } }, { status: 503 });
  }

  try {
    const challenge = await findChallengeById(challengeId);
    const browserToken = request.cookies.get(WECHAT_LOGIN_BROWSER_COOKIE)?.value;
    if (!challenge || !browserOwnsChallenge(challenge, browserToken)) {
      return NextResponse.json({ error: { code: "WECHAT_STATE_INVALID", message: "登录二维码不属于当前浏览器。" } }, { status: 403 });
    }
    if (challengeExpired(challenge)) {
      await markChallengeExpired(challenge.id);
      return NextResponse.json({ error: { code: "WECHAT_CHALLENGE_EXPIRED", message: "二维码已过期，请刷新后重试。" } }, { status: 410 });
    }
    if (challenge.status !== "authorized" || !challenge.user_id) {
      return NextResponse.json({ error: { code: "WECHAT_CONFIRM_REQUIRED", message: "请先在手机微信中确认登录。" } }, { status: 409 });
    }

    const now = new Date().toISOString();
    const claimed = await supabase
      .from("wechat_login_challenges")
      .update({ status: "consuming", updated_at: now })
      .eq("id", challenge.id)
      .eq("status", "authorized")
      .select("id")
      .maybeSingle();
    if (claimed.error || !claimed.data) {
      return NextResponse.json({ error: { code: "WECHAT_CHALLENGE_CONSUMED", message: "该登录二维码已经被使用。" } }, { status: 409 });
    }

    try {
      await issueSupabaseSessionForUser(challenge.user_id);
    } catch (error) {
      await supabase.from("wechat_login_challenges").update({
        status: "authorized",
        failure_code: error instanceof Error ? error.name : "AUTH_SESSION_ISSUE_FAILED",
        updated_at: new Date().toISOString(),
      }).eq("id", challenge.id).eq("status", "consuming");
      throw error;
    }

    await supabase.from("wechat_login_challenges").update({
      status: "consumed",
      consumed_at: new Date().toISOString(),
      failure_code: null,
      updated_at: new Date().toISOString(),
    }).eq("id", challenge.id).eq("status", "consuming");

    const response = NextResponse.json({ ok: true, returnTo: challenge.return_to });
    response.headers.set("Cache-Control", "no-store");
    response.cookies.set(WECHAT_LOGIN_BROWSER_COOKIE, "", secureCookieOptions(request.url, 0, "/"));
    return response;
  } catch (error) {
    console.error("WeChat login completion failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: { code: "AUTH_SESSION_ISSUE_FAILED", message: "建立登录状态失败，请重试。" } }, { status: 500 });
  }
}
