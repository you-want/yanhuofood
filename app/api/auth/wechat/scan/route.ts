import { NextResponse } from "next/server";
import { getWechatAccessToken } from "@/lib/wechat/access-token";
import {
  hasWechatScanLoginConfig,
  wechatLoginChallengeTtlSeconds,
  wechatPublicAccountName,
  wechatRequestTimeoutMs,
} from "@/lib/wechat/config";
import {
  createLoginChallenge,
  markChallengeFailed,
  safeReturnTo,
  secureCookieOptions,
  WECHAT_LOGIN_BROWSER_COOKIE,
} from "@/lib/wechat/login-challenge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SCAN_LOGIN_PREFIX = "login_";

export async function POST(request: Request) {
  if (!hasWechatScanLoginConfig()) {
    return NextResponse.json(
      { error: { code: "WECHAT_SCAN_LOGIN_DISABLED", message: "公众号扫码登录尚未配置。" } },
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

  let challengeId: string | null = null;
  try {
    const created = await createLoginChallenge(returnTo);
    challengeId = created.challenge.id;
    const accessToken = await getWechatAccessToken();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), wechatRequestTimeoutMs());
    let qrResponse: Response;
    try {
      qrResponse = await fetch(`https://api.weixin.qq.com/cgi-bin/qrcode/create?access_token=${encodeURIComponent(accessToken)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expire_seconds: wechatLoginChallengeTtlSeconds(),
          action_name: "QR_STR_SCENE",
          action_info: { scene: { scene_str: `${SCAN_LOGIN_PREFIX}${created.oauthState}` } },
        }),
        cache: "no-store",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const payload = await qrResponse.json() as {
      ticket?: string;
      expire_seconds?: number;
      errcode?: number;
      errmsg?: string;
    };
    if (!qrResponse.ok || !payload.ticket || payload.errcode) {
      throw new Error(payload.errmsg || "微信公众号二维码创建失败");
    }

    const response = NextResponse.json({
      challengeId: created.challenge.id,
      displayCode: created.challenge.display_code,
      qrCodeUrl: `https://mp.weixin.qq.com/cgi-bin/showqrcode?ticket=${encodeURIComponent(payload.ticket)}`,
      expiresAt: created.challenge.expires_at,
      accountName: wechatPublicAccountName(),
    });
    response.headers.set("Cache-Control", "no-store");
    response.cookies.set(
      WECHAT_LOGIN_BROWSER_COOKIE,
      created.browserToken,
      secureCookieOptions(request.url, wechatLoginChallengeTtlSeconds())
    );
    return response;
  } catch (error) {
    if (challengeId) await markChallengeFailed(challengeId, "WECHAT_QR_CREATE_FAILED");
    console.error("WeChat scan login QR creation failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json(
      { error: { code: "WECHAT_SCAN_QR_FAILED", message: "创建公众号登录二维码失败，请稍后重试。" } },
      { status: 502 }
    );
  }
}
