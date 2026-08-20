import { wechatAppId, wechatAppSecret, wechatOAuthRedirectUri, wechatRequestTimeoutMs } from "@/lib/wechat/config";

export class WechatOAuthError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "WechatOAuthError";
    this.code = code;
  }
}

async function fetchJson<T>(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), wechatRequestTimeoutMs());
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    const payload = await response.json() as T;
    if (!response.ok) throw new WechatOAuthError("WECHAT_HTTP_ERROR", `微信接口返回 ${response.status}`);
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

export function createWechatOAuthUrl(state: string, origin?: string) {
  const appId = wechatAppId();
  const redirectUri = wechatOAuthRedirectUri(origin);
  if (!appId || !redirectUri) throw new WechatOAuthError("WECHAT_CONFIG_MISSING", "微信公众号 OAuth 配置不完整");

  const params = new URLSearchParams({
    appid: appId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "snsapi_base",
    state,
  });
  return `https://open.weixin.qq.com/connect/oauth2/authorize?${params.toString()}#wechat_redirect`;
}

type OAuthTokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  openid?: string;
  scope?: string;
  unionid?: string;
  errcode?: number;
  errmsg?: string;
};

export async function exchangeWechatOAuthCode(code: string) {
  const appId = wechatAppId();
  const appSecret = wechatAppSecret();
  if (!appId || !appSecret) throw new WechatOAuthError("WECHAT_CONFIG_MISSING", "微信公众号 OAuth 配置不完整");

  const params = new URLSearchParams({
    appid: appId,
    secret: appSecret,
    code,
    grant_type: "authorization_code",
  });
  const payload = await fetchJson<OAuthTokenResponse>(`https://api.weixin.qq.com/sns/oauth2/access_token?${params.toString()}`);
  if (!payload.openid || payload.errcode) {
    throw new WechatOAuthError(String(payload.errcode || "WECHAT_OAUTH_FAILED"), payload.errmsg || "微信 OAuth 登录失败");
  }
  return { openid: payload.openid, unionid: payload.unionid || null, scope: payload.scope || "" };
}
