import { cleanSupabaseConfigValue } from "@/lib/supabase";

function clean(value: string | undefined) {
  return cleanSupabaseConfigValue(value);
}

function boundedNumber(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? Math.floor(parsed) : fallback;
}

export function wechatAppId() {
  return clean(process.env.WECHAT_APP_ID);
}

export function wechatAppSecret() {
  return clean(process.env.WECHAT_APP_SECRET);
}

export function wechatLoginHmacSecret() {
  const secret = clean(process.env.WECHAT_LOGIN_HMAC_SECRET);
  return secret.length >= 32 ? secret : "";
}

// 旧的网页 OAuth 登录已停用。只有显式开启新的 OAuth 专用开关时才允许旧流程，
// 避免生产环境遗留的 WECHAT_LOGIN_ENABLED=true 继续暴露不可用入口。
export function wechatLoginEnabled() {
  return clean(process.env.WECHAT_OAUTH_LOGIN_ENABLED).toLowerCase() === "true";
}

export function wechatCodeLoginEnabled() {
  return clean(process.env.WECHAT_CODE_LOGIN_ENABLED).toLowerCase() !== "false";
}

export function wechatScanLoginEnabled() {
  return clean(process.env.WECHAT_SCAN_LOGIN_ENABLED).toLowerCase() === "true";
}

export function wechatCodeLoginTtlSeconds() {
  return boundedNumber(process.env.WECHAT_CODE_LOGIN_TTL_SECONDS, 600, 120, 1800);
}

export function wechatCodeLoginCooldownSeconds() {
  return boundedNumber(process.env.WECHAT_CODE_LOGIN_COOLDOWN_SECONDS, 30, 10, 300);
}

export function wechatCodeLoginMaxAttempts() {
  return boundedNumber(process.env.WECHAT_CODE_LOGIN_MAX_ATTEMPTS, 8, 3, 20);
}

export function wechatPublicAccountName() {
  return clean(process.env.WECHAT_PUBLIC_ACCOUNT_NAME) || "烟火食间";
}

export function wechatPublicAccountQrUrl() {
  const value = clean(process.env.WECHAT_PUBLIC_ACCOUNT_QR_URL);
  if (!value) return "/wechat-official-account-qr.png";
  if (value.startsWith("/")) return value;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

export function wechatLoginChallengeTtlSeconds() {
  return boundedNumber(process.env.WECHAT_LOGIN_CHALLENGE_TTL_SECONDS, 300, 60, 900);
}

export function wechatFollowStatusFreshSeconds() {
  return boundedNumber(process.env.WECHAT_FOLLOW_STATUS_FRESH_SECONDS, 21_600, 300, 86_400);
}

export function wechatFollowStatusMaxStaleSeconds() {
  return boundedNumber(process.env.WECHAT_FOLLOW_STATUS_MAX_STALE_SECONDS, 86_400, 3_600, 604_800);
}

export function wechatFollowStatusRefreshEnabled() {
  return clean(process.env.WECHAT_FOLLOW_STATUS_REFRESH_ENABLED).toLowerCase() === "true";
}

export function wechatRequestTimeoutMs() {
  return boundedNumber(process.env.WECHAT_REQUEST_TIMEOUT_MS, 8_000, 1_000, 30_000);
}

export function wechatOAuthRedirectUri(origin?: string) {
  const configured = clean(process.env.WECHAT_OAUTH_REDIRECT_URI);
  if (configured) return configured;
  const siteUrl = clean(process.env.NEXT_PUBLIC_SITE_URL) || origin || "";
  return siteUrl ? `${siteUrl.replace(/\/$/, "")}/api/auth/wechat/oauth/callback` : "";
}

export function hasWechatLoginConfig(origin?: string) {
  return Boolean(
    wechatLoginEnabled() &&
    wechatAppId() &&
    wechatAppSecret() &&
    wechatLoginHmacSecret() &&
    wechatOAuthRedirectUri(origin)
  );
}

export function isWechatWebView(userAgent: string | null) {
  return /MicroMessenger/i.test(userAgent || "");
}

export function hasWechatCodeLoginConfig() {
  return Boolean(
    wechatCodeLoginEnabled() &&
    clean(process.env.WECHAT_TOKEN) &&
    wechatLoginHmacSecret()
  );
}

export function hasWechatScanLoginConfig() {
  return Boolean(
    wechatScanLoginEnabled() &&
    wechatAppId() &&
    wechatAppSecret() &&
    clean(process.env.WECHAT_TOKEN) &&
    wechatLoginHmacSecret()
  );
}
