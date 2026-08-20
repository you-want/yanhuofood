import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase-auth";
import { supabaseServer } from "@/lib/supabase";
import { findOrCreateWechatUser, updateWechatFollowState } from "@/lib/wechat/account";
import { wechatLoginChallengeTtlSeconds } from "@/lib/wechat/config";
import { hashToken, randomToken } from "@/lib/wechat/crypto";
import { queryWechatFollowStatus } from "@/lib/wechat/follow-status";
import {
  browserOwnsChallenge,
  challengeExpired,
  findChallengeByState,
  markChallengeExpired,
  markChallengeFailed,
  secureCookieOptions,
  WECHAT_LOGIN_BROWSER_COOKIE,
  WECHAT_LOGIN_CONFIRM_COOKIE,
} from "@/lib/wechat/login-challenge";
import { exchangeWechatOAuthCode } from "@/lib/wechat/oauth";
import { issueSupabaseSessionForUser } from "@/lib/wechat/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function protectedRedirect(url: URL) {
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

function accountRedirect(request: NextRequest, code: string) {
  const url = new URL("/account", request.url);
  url.searchParams.set("wechatLogin", code);
  return protectedRedirect(url);
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code") || "";
  const state = request.nextUrl.searchParams.get("state") || "";
  if (!code || !state) return accountRedirect(request, "oauth_failed");

  const supabase = supabaseServer();
  if (!supabase) return accountRedirect(request, "database_unavailable");

  let challenge;
  try {
    challenge = await findChallengeByState(state);
  } catch (error) {
    console.error("WeChat challenge lookup failed", error instanceof Error ? error.message : "unknown");
    return accountRedirect(request, "state_invalid");
  }
  if (!challenge || challenge.status !== "pending") return accountRedirect(request, "state_invalid");
  if (challengeExpired(challenge)) {
    await markChallengeExpired(challenge.id);
    return accountRedirect(request, "expired");
  }

  try {
    const identity = await exchangeWechatOAuthCode(code);
    const currentUser = await getRequestUser(request);
    const account = await findOrCreateWechatUser({
      openid: identity.openid,
      unionid: identity.unionid,
      currentUser,
    });

    try {
      const follow = await queryWechatFollowStatus(identity.openid);
      await updateWechatFollowState({
        userId: account.userId,
        openid: identity.openid,
        unionid: identity.unionid,
        result: follow,
      });
    } catch (error) {
      console.error("WeChat follow status lookup failed", error instanceof Error ? error.message : "unknown");
    }

    const browserToken = request.cookies.get(WECHAT_LOGIN_BROWSER_COOKIE)?.value;
    const sameBrowser = browserOwnsChallenge(challenge, browserToken);
    const now = new Date().toISOString();

    if (sameBrowser) {
      const claimed = await supabase
        .from("wechat_login_challenges")
        .update({
          status: "consuming",
          user_id: account.userId,
          wechat_openid: identity.openid,
          authorized_at: now,
          updated_at: now,
        })
        .eq("id", challenge.id)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();
      if (!claimed.data || claimed.error) return accountRedirect(request, "state_conflict");

      try {
        await issueSupabaseSessionForUser(account.userId);
      } catch (error) {
        await markChallengeFailed(challenge.id, "AUTH_SESSION_ISSUE_FAILED");
        throw error;
      }

      await supabase.from("wechat_login_challenges").update({
        status: "consumed",
        consumed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", challenge.id).eq("status", "consuming");

      const response = protectedRedirect(new URL(challenge.return_to, request.url));
      response.cookies.set(WECHAT_LOGIN_BROWSER_COOKIE, "", secureCookieOptions(request.url, 0, "/"));
      response.headers.set("Cache-Control", "no-store");
      return response;
    }

    const mobileToken = randomToken(32);
    const prepared = await supabase
      .from("wechat_login_challenges")
      .update({
        status: "confirming",
        user_id: account.userId,
        wechat_openid: identity.openid,
        mobile_confirm_token_hash: hashToken(mobileToken),
        updated_at: now,
      })
      .eq("id", challenge.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (!prepared.data || prepared.error) return accountRedirect(request, "state_conflict");

    const confirmUrl = new URL("/wechat-login/confirm", request.url);
    confirmUrl.searchParams.set("challengeId", challenge.id);
    confirmUrl.searchParams.set("displayCode", challenge.display_code);
    const response = protectedRedirect(confirmUrl);
    response.cookies.set(
      WECHAT_LOGIN_CONFIRM_COOKIE,
      mobileToken,
      secureCookieOptions(request.url, wechatLoginChallengeTtlSeconds(), "/")
    );
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    const errorCode = typeof error === "object" && error && "code" in error ? String(error.code) : "WECHAT_OAUTH_FAILED";
    await markChallengeFailed(challenge.id, errorCode);
    console.error("WeChat OAuth callback failed", error instanceof Error ? error.message : "unknown");
    return accountRedirect(request, "oauth_failed");
  }
}
