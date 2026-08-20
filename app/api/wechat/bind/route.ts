import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getHostedAccess, hasWechatIntegrationConfig } from "@/lib/supabase-auth";
import { supabaseServer, withSupabaseTimeout } from "@/lib/supabase";
import { getWechatAccessToken } from "@/lib/wechat/access-token";
import { wechatRequestTimeoutMs } from "@/lib/wechat/config";

const DEFAULT_EXPIRE_SECONDS = 600;


function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function expireSeconds() {
  const value = Number(process.env.WECHAT_QR_EXPIRE_SECONDS);
  return Number.isFinite(value) && value >= 60 && value <= 2592000 ? Math.floor(value) : DEFAULT_EXPIRE_SECONDS;
}

export async function POST(request: Request) {
  const access = await getHostedAccess(request);
  if (!access.user) {
    return NextResponse.json({ error: { code: "AUTH_REQUIRED", message: "请先登录账户。" } }, { status: 401 });
  }
  if (access.account?.wechat_status === "following") {
    return NextResponse.json({ error: { code: "ALREADY_BOUND", message: "当前账户已经完成微信公众号绑定。" } }, { status: 409 });
  }
  if (!hasWechatIntegrationConfig()) {
    return NextResponse.json(
      { error: { code: "WECHAT_NOT_CONFIGURED", message: "服务端尚未配置微信公众号 App ID、App Secret 和 Token。" } },
      { status: 503 }
    );
  }

  const supabase = supabaseServer();
  if (!supabase) {
    return NextResponse.json({ error: { code: "DATABASE_NOT_CONFIGURED", message: "服务端数据库未配置。" } }, { status: 503 });
  }

  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + expireSeconds() * 1000).toISOString();
  const { error: tokenError } = await withSupabaseTimeout(
    supabase.from("wechat_binding_tokens").insert({
      token_hash: hashToken(token),
      user_id: access.user.id,
      expires_at: expiresAt,
    })
  );
  if (tokenError) {
    return NextResponse.json({ error: { code: "BINDING_TOKEN_FAILED", message: "创建绑定二维码失败，请稍后重试。" } }, { status: 500 });
  }

  try {
    const accessToken = await getWechatAccessToken();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), wechatRequestTimeoutMs());
    let qrResponse: Response;
    try {
      qrResponse = await fetch(`https://api.weixin.qq.com/cgi-bin/qrcode/create?access_token=${encodeURIComponent(accessToken)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expire_seconds: expireSeconds(),
          action_name: "QR_STR_SCENE",
          action_info: { scene: { scene_str: token } },
        }),
        cache: "no-store",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    const payload = await qrResponse.json() as { ticket?: string; expire_seconds?: number; errcode?: number; errmsg?: string };
    if (!qrResponse.ok || !payload.ticket) throw new Error(payload.errmsg || "微信公众号二维码创建失败");

    await supabase.from("app_accounts").update({ wechat_status: "pending", updated_at: new Date().toISOString() }).eq("user_id", access.user.id);
    return NextResponse.json({
      qrCodeUrl: `https://mp.weixin.qq.com/cgi-bin/showqrcode?ticket=${encodeURIComponent(payload.ticket)}`,
      expiresAt,
      expireSeconds: payload.expire_seconds || expireSeconds(),
    });
  } catch (error) {
    console.error("WeChat QR creation failed", error);
    await supabase.from("wechat_binding_tokens").delete().eq("token_hash", hashToken(token));
    return NextResponse.json({ error: { code: "WECHAT_QR_FAILED", message: "微信公众号二维码创建失败，请检查公众号配置。" } }, { status: 502 });
  }
}
