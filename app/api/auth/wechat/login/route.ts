import QRCode from "qrcode";
import { NextResponse } from "next/server";
import { createWechatOAuthUrl } from "@/lib/wechat/oauth";
import { hasWechatLoginConfig, isWechatWebView, wechatLoginChallengeTtlSeconds } from "@/lib/wechat/config";
import {
  createLoginChallenge,
  safeReturnTo,
  secureCookieOptions,
  WECHAT_LOGIN_BROWSER_COOKIE,
} from "@/lib/wechat/login-challenge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const origin = new URL(request.url).origin;
  if (!hasWechatLoginConfig(origin)) {
    return NextResponse.json(
      { error: { code: "WECHAT_LOGIN_DISABLED", message: "微信登录尚未配置或未启用。" } },
      { status: 503 }
    );
  }

  let returnTo = "/account";
  try {
    const body = await request.json() as { returnTo?: unknown };
    returnTo = safeReturnTo(body.returnTo);
  } catch {
    // 请求体可省略。
  }

  try {
    const created = await createLoginChallenge(returnTo);
    const authorizeUrl = createWechatOAuthUrl(created.oauthState, origin);
    const qrCodeDataUrl = await QRCode.toDataURL(authorizeUrl, {
      width: 320,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#14532d", light: "#ffffff" },
    });
    const response = NextResponse.json({
      challengeId: created.challenge.id,
      displayCode: created.challenge.display_code,
      expiresAt: created.challenge.expires_at,
      mode: isWechatWebView(request.headers.get("user-agent")) ? "wechat_webview" : "desktop_qr",
      authorizeUrl,
      qrCodeDataUrl,
    });
    response.headers.set("Cache-Control", "no-store");
    response.cookies.set(
      WECHAT_LOGIN_BROWSER_COOKIE,
      created.browserToken,
      secureCookieOptions(request.url, wechatLoginChallengeTtlSeconds())
    );
    return response;
  } catch (error) {
    console.error("WeChat login challenge creation failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json(
      { error: { code: "WECHAT_CHALLENGE_CREATE_FAILED", message: "创建微信登录二维码失败，请稍后重试。" } },
      { status: 500 }
    );
  }
}
