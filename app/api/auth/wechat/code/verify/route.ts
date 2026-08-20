import { NextResponse } from "next/server";
import { wechatCodeLoginSchema } from "@/lib/schemas/wechat-auth";
import { supabaseServer } from "@/lib/supabase";
import {
  claimWechatLoginCode,
  finishWechatLoginCode,
  hashWechatLoginClient,
} from "@/lib/wechat/code-login";
import { hasWechatCodeLoginConfig, wechatCodeLoginMaxAttempts } from "@/lib/wechat/config";
import { safeReturnTo } from "@/lib/wechat/login-challenge";
import { issueSupabaseSessionForUser } from "@/lib/wechat/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clientIdentity(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
  return hashWechatLoginClient(ip);
}

export async function POST(request: Request) {
  if (!hasWechatCodeLoginConfig()) {
    return NextResponse.json(
      { error: { code: "WECHAT_CODE_LOGIN_DISABLED", message: "公众号验证码登录尚未配置。" } },
      { status: 503 }
    );
  }

  const supabase = supabaseServer();
  if (!supabase) {
    return NextResponse.json({ error: { code: "DATABASE_NOT_CONFIGURED", message: "服务端数据库未配置。" } }, { status: 503 });
  }

  const parsed = wechatCodeLoginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "INVALID_CODE_FORMAT", message: parsed.error.issues[0]?.message || "验证码格式不正确。" } },
      { status: 400 }
    );
  }

  const rateLimit = await supabase.rpc("take_wechat_login_attempt", {
    p_client_hash: clientIdentity(request),
    p_max_attempts: wechatCodeLoginMaxAttempts(),
    p_window_seconds: 600,
  });
  if (rateLimit.error) {
    console.error("WeChat code login rate limit failed", rateLimit.error.message);
    return NextResponse.json({ error: { code: "RATE_LIMIT_UNAVAILABLE", message: "登录服务暂时不可用，请稍后重试。" } }, { status: 503 });
  }
  const limit = Array.isArray(rateLimit.data) ? rateLimit.data[0] : rateLimit.data;
  if (!limit?.allowed) {
    const retryAfter = Math.max(1, Number(limit?.retry_after_seconds) || 600);
    return NextResponse.json(
      { error: { code: "TOO_MANY_ATTEMPTS", message: "验证码尝试次数过多，请稍后再试。", retryAfter } },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  let claimed;
  try {
    claimed = await claimWechatLoginCode(parsed.data.code);
  } catch (error) {
    console.error("WeChat code lookup failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json(
      { error: { code: "WECHAT_CODE_LOOKUP_FAILED", message: "登录服务暂时不可用，请稍后重试。" } },
      { status: 503 }
    );
  }
  if (!claimed) {
    return NextResponse.json(
      { error: { code: "WECHAT_CODE_INVALID", message: "验证码不正确、已使用或已过期，请在公众号重新回复【登录】。" } },
      { status: 401 }
    );
  }

  try {
    await issueSupabaseSessionForUser(claimed.user_id);
    await finishWechatLoginCode(claimed.id, true);
    return NextResponse.json({ ok: true, returnTo: safeReturnTo(parsed.data.returnTo) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const failureCode = typeof error === "object" && error && "code" in error
      ? String(error.code)
      : "SESSION_ISSUE_FAILED";
    await finishWechatLoginCode(claimed.id, false, failureCode);
    console.error("WeChat code login session issue failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json(
      { error: { code: "WECHAT_SESSION_FAILED", message: "登录会话创建失败，请在公众号重新获取验证码。" } },
      { status: 500 }
    );
  }
}
