import { createDisplayCode, hashToken, randomToken, tokenHashMatches } from "@/lib/wechat/crypto";
import { wechatLoginChallengeTtlSeconds } from "@/lib/wechat/config";
import { supabaseServer } from "@/lib/supabase";

export const WECHAT_LOGIN_BROWSER_COOKIE = "yanhuo_wechat_login";
export const WECHAT_LOGIN_CONFIRM_COOKIE = "yanhuo_wechat_confirm";

export type WechatLoginChallengeStatus =
  | "pending"
  | "confirming"
  | "authorized"
  | "consuming"
  | "consumed"
  | "expired"
  | "failed";

export type WechatLoginChallenge = {
  id: string;
  oauth_state_hash: string;
  browser_token_hash: string;
  mobile_confirm_token_hash: string | null;
  display_code: string;
  status: WechatLoginChallengeStatus;
  user_id: string | null;
  wechat_openid: string | null;
  return_to: string;
  expires_at: string;
  authorized_at: string | null;
  consumed_at: string | null;
  failure_code: string | null;
  created_at: string;
  updated_at: string;
};

const CHALLENGE_COLUMNS = [
  "id",
  "oauth_state_hash",
  "browser_token_hash",
  "mobile_confirm_token_hash",
  "display_code",
  "status",
  "user_id",
  "wechat_openid",
  "return_to",
  "expires_at",
  "authorized_at",
  "consumed_at",
  "failure_code",
  "created_at",
  "updated_at",
].join(",");

export function safeReturnTo(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/account";
  try {
    const parsed = new URL(value, "https://yanhuofood.invalid");
    return parsed.origin === "https://yanhuofood.invalid" ? `${parsed.pathname}${parsed.search}${parsed.hash}` : "/account";
  } catch {
    return "/account";
  }
}

export async function createLoginChallenge(returnTo: string) {
  const supabase = supabaseServer();
  if (!supabase) throw new Error("DATABASE_NOT_CONFIGURED");

  const oauthState = randomToken(24);
  const browserToken = randomToken(32);
  const expiresAt = new Date(Date.now() + wechatLoginChallengeTtlSeconds() * 1000).toISOString();
  const { data, error } = await supabase
    .from("wechat_login_challenges")
    .insert({
      oauth_state_hash: hashToken(oauthState),
      browser_token_hash: hashToken(browserToken),
      display_code: createDisplayCode(),
      return_to: safeReturnTo(returnTo),
      expires_at: expiresAt,
    })
    .select(CHALLENGE_COLUMNS)
    .single();
  if (error || !data) throw new Error(error?.message || "WECHAT_CHALLENGE_CREATE_FAILED");
  return { challenge: data as unknown as WechatLoginChallenge, oauthState, browserToken };
}

export async function findChallengeByState(rawState: string) {
  const supabase = supabaseServer();
  if (!supabase) throw new Error("DATABASE_NOT_CONFIGURED");
  const { data, error } = await supabase
    .from("wechat_login_challenges")
    .select(CHALLENGE_COLUMNS)
    .eq("oauth_state_hash", hashToken(rawState))
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as unknown as WechatLoginChallenge | null;
}

export async function findChallengeById(id: string) {
  const supabase = supabaseServer();
  if (!supabase) throw new Error("DATABASE_NOT_CONFIGURED");
  const { data, error } = await supabase
    .from("wechat_login_challenges")
    .select(CHALLENGE_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as unknown as WechatLoginChallenge | null;
}

export function challengeExpired(challenge: WechatLoginChallenge) {
  return new Date(challenge.expires_at).getTime() <= Date.now();
}

export function browserOwnsChallenge(challenge: WechatLoginChallenge, rawBrowserToken?: string) {
  return tokenHashMatches(rawBrowserToken, challenge.browser_token_hash);
}

export function mobileOwnsChallenge(challenge: WechatLoginChallenge, rawMobileToken?: string) {
  return tokenHashMatches(rawMobileToken, challenge.mobile_confirm_token_hash);
}

export async function markChallengeExpired(id: string) {
  const supabase = supabaseServer();
  if (!supabase) return;
  await supabase.from("wechat_login_challenges").update({
    status: "expired",
    updated_at: new Date().toISOString(),
  }).eq("id", id).in("status", ["pending", "confirming", "authorized"]);
}

export async function markChallengeFailed(id: string, failureCode: string) {
  const supabase = supabaseServer();
  if (!supabase) return;
  await supabase.from("wechat_login_challenges").update({
    status: "failed",
    failure_code: failureCode.slice(0, 120),
    updated_at: new Date().toISOString(),
  }).eq("id", id).neq("status", "consumed");
}

export function secureCookieOptions(requestUrl: string, maxAge: number, path = "/") {
  const secure = process.env.NODE_ENV === "production" || requestUrl.startsWith("https://");
  return { httpOnly: true, secure, sameSite: "lax" as const, path, maxAge };
}
