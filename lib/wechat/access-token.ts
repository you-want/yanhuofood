import { supabaseServer } from "@/lib/supabase";
import { wechatAppId, wechatAppSecret, wechatRequestTimeoutMs } from "@/lib/wechat/config";

const TOKEN_KEY = "official_account";
const TOKEN_SAFETY_SECONDS = 120;
let refreshInFlight: Promise<string> | null = null;

export class WechatApiError extends Error {
  code: number | string;

  constructor(code: number | string, message: string) {
    super(message);
    this.name = "WechatApiError";
    this.code = code;
  }
}

async function requestNewAccessToken() {
  const appId = wechatAppId();
  const appSecret = wechatAppSecret();
  if (!appId || !appSecret) throw new WechatApiError("WECHAT_CONFIG_MISSING", "微信公众号配置不完整");

  const params = new URLSearchParams({ grant_type: "client_credential", appid: appId, secret: appSecret });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), wechatRequestTimeoutMs());
  try {
    const response = await fetch(`https://api.weixin.qq.com/cgi-bin/token?${params.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = await response.json() as { access_token?: string; expires_in?: number; errcode?: number; errmsg?: string };
    if (!response.ok || !payload.access_token || payload.errcode) {
      throw new WechatApiError(payload.errcode || response.status, payload.errmsg || "获取微信公众号 access token 失败");
    }
    return { token: payload.access_token, expiresIn: payload.expires_in || 7200 };
  } finally {
    clearTimeout(timeout);
  }
}

export async function clearWechatAccessToken() {
  const supabase = supabaseServer();
  if (supabase) await supabase.from("wechat_access_tokens").delete().eq("token_key", TOKEN_KEY);
}

export async function getWechatAccessToken(options: { forceRefresh?: boolean } = {}) {
  const supabase = supabaseServer();
  if (!supabase) throw new WechatApiError("DATABASE_NOT_CONFIGURED", "Supabase service role 未配置");

  if (!options.forceRefresh) {
    const { data } = await supabase
      .from("wechat_access_tokens")
      .select("access_token,expires_at")
      .eq("token_key", TOKEN_KEY)
      .gt("expires_at", new Date(Date.now() + 60_000).toISOString())
      .maybeSingle();
    if (data?.access_token) return data.access_token as string;
  }

  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const fresh = await requestNewAccessToken();
      const expiresAt = new Date(Date.now() + Math.max(60, fresh.expiresIn - TOKEN_SAFETY_SECONDS) * 1000).toISOString();
      const stored = await supabase.from("wechat_access_tokens").upsert({
        token_key: TOKEN_KEY,
        access_token: fresh.token,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      }, { onConflict: "token_key" });
      if (stored.error) throw new WechatApiError("TOKEN_CACHE_WRITE_FAILED", stored.error.message);
      return fresh.token;
    })();
  }

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}
