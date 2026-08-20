import { NextResponse } from "next/server";
import { getHostedAccess, hasWechatIntegrationConfig } from "@/lib/supabase-auth";
import { cleanSupabaseConfigValue } from "@/lib/supabase";
import { isSyntheticWechatEmail } from "@/lib/wechat/account";
import {
  hasWechatCodeLoginConfig,
  hasWechatLoginConfig,
  hasWechatScanLoginConfig,
  wechatCodeLoginTtlSeconds,
  wechatFollowStatusRefreshEnabled,
  wechatPublicAccountName,
} from "@/lib/wechat/config";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const access = await getHostedAccess(request, {
    forceWechatRefresh: url.searchParams.get("refreshWechat") === "1",
  });
  const origin = url.origin;
  const modelHostedConfigured = Boolean(cleanSupabaseConfigValue(process.env.OPENAI_API_KEY));
  const amapHostedConfigured = Boolean(cleanSupabaseConfigValue(process.env.AMAP_WEB_SERVICE_KEY));
  const syntheticEmail = access.user ? isSyntheticWechatEmail(access.user) : false;
  return NextResponse.json({
    authenticated: Boolean(access.user),
    user: access.user ? {
      id: access.user.id,
      email: syntheticEmail ? null : access.user.email || null,
      authProvider: access.account?.auth_provider || (syntheticEmail ? "wechat" : "email"),
    } : null,
    access: {
      allowed: access.allowed,
      reason: access.reason,
      // 保留原字段作为“当前账户可用”兼容值，并单独返回服务端配置状态，
      // 避免前端把“未授权”和“服务端未配置 Key”混为一谈。
      modelConfigured: access.allowed && modelHostedConfigured,
      amapConfigured: access.allowed && amapHostedConfigured,
      modelHostedConfigured,
      amapHostedConfigured,
    },
    wechat: {
      configured: hasWechatIntegrationConfig(),
      loginConfigured: hasWechatLoginConfig(origin),
      scanLoginConfigured: hasWechatScanLoginConfig(),
      codeLoginConfigured: hasWechatCodeLoginConfig(),
      followStatusRefreshEnabled: wechatFollowStatusRefreshEnabled(),
      publicAccountName: wechatPublicAccountName(),
      codeLoginTtlSeconds: wechatCodeLoginTtlSeconds(),
      status: access.account?.wechat_status || "unbound",
      openidBound: Boolean(access.account?.wechat_openid),
      followedAt: access.account?.wechat_followed_at || null,
      statusCheckedAt: access.account?.wechat_status_checked_at || null,
      statusRefreshFailed: Boolean(access.wechatStatusRefreshFailed),
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
