import { getWechatAccessToken, WechatApiError } from "@/lib/wechat/access-token";
import { wechatRequestTimeoutMs } from "@/lib/wechat/config";

const INVALID_TOKEN_CODES = new Set([40001, 40014, 42001]);

export type WechatFollowResult = {
  status: "following" | "unbound";
  followedAt: string | null;
};

async function fetchFollowStatus(openid: string, forceRefresh: boolean): Promise<WechatFollowResult> {
  const accessToken = await getWechatAccessToken({ forceRefresh });
  const params = new URLSearchParams({ access_token: accessToken, openid, lang: "zh_CN" });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), wechatRequestTimeoutMs());
  try {
    const response = await fetch(`https://api.weixin.qq.com/cgi-bin/user/info?${params.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = await response.json() as {
      subscribe?: number;
      subscribe_time?: number;
      errcode?: number;
      errmsg?: string;
    };
    if (!response.ok || payload.errcode) {
      const error = new WechatApiError(payload.errcode || response.status, payload.errmsg || "查询公众号关注状态失败");
      if (!forceRefresh && typeof error.code === "number" && INVALID_TOKEN_CODES.has(error.code)) {
        return fetchFollowStatus(openid, true);
      }
      throw error;
    }
    return {
      status: payload.subscribe === 1 ? "following" : "unbound",
      followedAt: payload.subscribe === 1 && payload.subscribe_time
        ? new Date(payload.subscribe_time * 1000).toISOString()
        : null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function queryWechatFollowStatus(openid: string) {
  return fetchFollowStatus(openid, false);
}
