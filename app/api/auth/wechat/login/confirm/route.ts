import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import {
  challengeExpired,
  findChallengeById,
  markChallengeExpired,
  mobileOwnsChallenge,
  secureCookieOptions,
  WECHAT_LOGIN_CONFIRM_COOKIE,
} from "@/lib/wechat/login-challenge";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let challengeId = "";
  try {
    const body = await request.json() as { challengeId?: string };
    challengeId = body.challengeId || "";
  } catch {
    return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "确认请求格式不正确。" } }, { status: 400 });
  }

  const supabase = supabaseServer();
  if (!supabase) {
    return NextResponse.json({ error: { code: "DATABASE_NOT_CONFIGURED", message: "服务端数据库未配置。" } }, { status: 503 });
  }

  try {
    const challenge = await findChallengeById(challengeId);
    const confirmToken = request.cookies.get(WECHAT_LOGIN_CONFIRM_COOKIE)?.value;
    if (!challenge || !mobileOwnsChallenge(challenge, confirmToken)) {
      return NextResponse.json({ error: { code: "WECHAT_STATE_INVALID", message: "登录确认已失效，请重新扫码。" } }, { status: 403 });
    }
    if (challengeExpired(challenge)) {
      await markChallengeExpired(challenge.id);
      return NextResponse.json({ error: { code: "WECHAT_CHALLENGE_EXPIRED", message: "二维码已过期，请返回电脑刷新。" } }, { status: 410 });
    }
    if (challenge.status === "authorized") {
      return NextResponse.json({ ok: true });
    }
    if (challenge.status !== "confirming" || !challenge.user_id) {
      return NextResponse.json({ error: { code: "WECHAT_STATE_INVALID", message: "当前登录状态不能确认。" } }, { status: 409 });
    }

    const now = new Date().toISOString();
    const updated = await supabase
      .from("wechat_login_challenges")
      .update({
        status: "authorized",
        authorized_at: now,
        updated_at: now,
      })
      .eq("id", challenge.id)
      .eq("status", "confirming")
      .select("id")
      .maybeSingle();
    if (updated.error || !updated.data) {
      return NextResponse.json({ error: { code: "WECHAT_STATE_CONFLICT", message: "登录状态已经变化，请返回电脑查看。" } }, { status: 409 });
    }

    const response = NextResponse.json({ ok: true });
    response.headers.set("Cache-Control", "no-store");
    response.cookies.set(WECHAT_LOGIN_CONFIRM_COOKIE, "", secureCookieOptions(request.url, 0, "/"));
    return response;
  } catch (error) {
    console.error("WeChat login confirmation failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: { code: "WECHAT_CONFIRM_FAILED", message: "确认登录失败，请重新扫码。" } }, { status: 500 });
  }
}
