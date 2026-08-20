import { NextResponse } from "next/server";
import { getWechatAccessToken } from "@/lib/wechat/access-token";
import {
  hasWechatCodeLoginConfig,
  wechatAppId,
  wechatAppSecret,
  wechatPublicAccountName,
  wechatPublicAccountQrUrl,
  wechatRequestTimeoutMs,
} from "@/lib/wechat/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXPIRE_SECONDS = 600;
let cachedQr: { qrCodeUrl: string; expiresAt: string } | null = null;

export async function GET() {
  if (!hasWechatCodeLoginConfig()) {
    return NextResponse.json(
      { error: { code: "WECHAT_CODE_LOGIN_DISABLED", message: "公众号验证码登录尚未配置。" } },
      { status: 503 }
    );
  }

  const staticQrUrl = wechatPublicAccountQrUrl();
  if (staticQrUrl) {
    return NextResponse.json({
      qrCodeUrl: staticQrUrl,
      expiresAt: null,
      accountName: wechatPublicAccountName(),
      source: "static",
    }, { headers: { "Cache-Control": "private, max-age=300" } });
  }

  if (cachedQr && new Date(cachedQr.expiresAt).getTime() > Date.now() + 120_000) {
    return NextResponse.json({ ...cachedQr, accountName: wechatPublicAccountName(), source: "temporary" }, {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  }

  if (!wechatAppId() || !wechatAppSecret()) {
    return NextResponse.json({
      error: {
        code: "WECHAT_QR_NOT_CONFIGURED",
        message: `请在微信中搜索公众号“${wechatPublicAccountName()}”并关注。`,
      },
      accountName: wechatPublicAccountName(),
    }, { status: 503 });
  }

  try {
    const accessToken = await getWechatAccessToken();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), wechatRequestTimeoutMs());
    let response: Response;
    try {
      response = await fetch(`https://api.weixin.qq.com/cgi-bin/qrcode/create?access_token=${encodeURIComponent(accessToken)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expire_seconds: EXPIRE_SECONDS,
          action_name: "QR_STR_SCENE",
          action_info: { scene: { scene_str: "code_login" } },
        }),
        cache: "no-store",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    const payload = await response.json() as { ticket?: string; expire_seconds?: number; errcode?: number; errmsg?: string };
    if (!response.ok || !payload.ticket || payload.errcode) throw new Error(payload.errmsg || "公众号二维码创建失败");

    cachedQr = {
      qrCodeUrl: `https://mp.weixin.qq.com/cgi-bin/showqrcode?ticket=${encodeURIComponent(payload.ticket)}`,
      expiresAt: new Date(Date.now() + (payload.expire_seconds || EXPIRE_SECONDS) * 1000).toISOString(),
    };
    return NextResponse.json({ ...cachedQr, accountName: wechatPublicAccountName(), source: "temporary" }, {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  } catch (error) {
    console.error("WeChat public account login QR failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({
      error: {
        code: "WECHAT_QR_FAILED",
        message: `二维码暂时无法生成，请在微信中搜索公众号“${wechatPublicAccountName()}”并关注。`,
      },
      accountName: wechatPublicAccountName(),
    }, { status: 502 });
  }
}
