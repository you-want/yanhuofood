import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { isMissingAccountColumnError } from "@/lib/supabase-auth";
import { findOrCreateWechatUser, updateWechatFollowState } from "@/lib/wechat/account";
import { createWechatLoginCode, isWechatLoginKeyword, WechatCodeLoginError } from "@/lib/wechat/code-login";
import { hasWechatCodeLoginConfig, wechatCodeLoginTtlSeconds } from "@/lib/wechat/config";
import {
  challengeExpired,
  findChallengeByState,
  markChallengeExpired,
  markChallengeFailed,
} from "@/lib/wechat/login-challenge";
import { wechatCallbackSignatureMatches } from "@/lib/wechat/signature";
import { wechatTextReplyXml, wechatXmlText } from "@/lib/wechat/xml";

export const runtime = "nodejs";

const SCAN_LOGIN_PREFIX = "login_";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function successResponse() {
  return new NextResponse("success", {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

function textResponse(toUserName: string, fromUserName: string, content: string) {
  return new NextResponse(wechatTextReplyXml({ toUserName, fromUserName, content }), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

async function updateKnownFollower(openid: string, following: boolean) {
  const supabase = supabaseServer();
  if (!supabase) return;
  const now = new Date().toISOString();
  const current = await supabase.from("app_accounts").update({
    wechat_status: following ? "following" : "unbound",
    wechat_followed_at: following ? now : null,
    wechat_status_checked_at: now,
    updated_at: now,
  }).eq("wechat_openid", openid);
  if (isMissingAccountColumnError(current.error)) {
    await supabase.from("app_accounts").update({
      wechat_status: following ? "following" : "unbound",
      wechat_followed_at: following ? now : null,
      updated_at: now,
    }).eq("wechat_openid", openid);
  }
}

async function markWechatCodeUserFollowing(userId: string, openid: string) {
  const supabase = supabaseServer();
  if (!supabase) return;
  const now = new Date().toISOString();
  const updated = await supabase.from("app_accounts").update({
    wechat_status: "following",
    wechat_followed_at: now,
    wechat_status_checked_at: now,
    updated_at: now,
  }).eq("user_id", userId).eq("wechat_openid", openid);
  if (updated.error) throw new WechatCodeLoginError("WECHAT_ACCOUNT_WRITE_FAILED", updated.error.message);
}

async function handleLoginKeyword(openid: string) {
  if (!hasWechatCodeLoginConfig()) {
    return "公众号验证码登录暂未开放，请稍后再试。";
  }

  try {
    const account = await findOrCreateWechatUser({ openid });
    await markWechatCodeUserFollowing(account.userId, openid);
    const created = await createWechatLoginCode({ userId: account.userId, openid });
    const minutes = Math.ceil(wechatCodeLoginTtlSeconds() / 60);
    return `烟火食间登录验证码：${created.code}\n\n${minutes} 分钟内有效，仅可使用一次。请回到网页输入验证码，切勿转发给他人。`;
  } catch (error) {
    if (error instanceof WechatCodeLoginError && error.code === "WECHAT_CODE_COOLDOWN") {
      return "验证码刚刚已经发送，请使用上一条消息中的 6 位验证码。若已失效，请稍后再次回复【登录】。";
    }
    console.error("WeChat code creation failed", error instanceof Error ? error.message : "unknown");
    return "验证码生成失败，请稍后重新回复【登录】。";
  }
}

async function authorizeScanLogin(rawState: string, openid: string) {
  const supabase = supabaseServer();
  if (!supabase) return false;

  const challenge = await findChallengeByState(rawState);
  if (!challenge || challenge.status !== "pending") return false;
  if (challengeExpired(challenge)) {
    await markChallengeExpired(challenge.id);
    return false;
  }

  try {
    const account = await findOrCreateWechatUser({ openid });
    await updateWechatFollowState({
      userId: account.userId,
      openid,
      result: { status: "following", followedAt: new Date().toISOString() },
    });
    const now = new Date().toISOString();
    const authorized = await supabase
      .from("wechat_login_challenges")
      .update({
        status: "authorized",
        user_id: account.userId,
        wechat_openid: openid,
        authorized_at: now,
        updated_at: now,
      })
      .eq("id", challenge.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (authorized.error) throw authorized.error;
    return Boolean(authorized.data);
  } catch (error) {
    console.error("WeChat scan login authorization failed", error instanceof Error ? error.message : "unknown");
    await markChallengeFailed(challenge.id, "WECHAT_SCAN_AUTH_FAILED");
    return false;
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (!wechatCallbackSignatureMatches(url.searchParams)) return new NextResponse("invalid signature", { status: 403 });
  return new NextResponse(url.searchParams.get("echostr") || "", { status: 200 });
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  if (!wechatCallbackSignatureMatches(url.searchParams)) return new NextResponse("invalid signature", { status: 403 });

  const xml = await request.text();
  const messageType = wechatXmlText(xml, "MsgType").toLowerCase();
  const event = wechatXmlText(xml, "Event").toLowerCase();
  const content = wechatXmlText(xml, "Content");
  const fromUserName = wechatXmlText(xml, "FromUserName");
  const toUserName = wechatXmlText(xml, "ToUserName");
  const eventKey = wechatXmlText(xml, "EventKey");
  const sceneToken = eventKey.replace(/^qrscene_/, "");
  if (!fromUserName) return successResponse();

  const supabase = supabaseServer();
  if (!supabase) return successResponse();

  if (event === "unsubscribe") {
    await updateKnownFollower(fromUserName, false);
    return successResponse();
  }

  if (["subscribe", "scan"].includes(event)) {
    // 收到关注或扫码事件即可同步已知账户状态；验证码登录会在用户回复关键词时创建账户。
    await updateKnownFollower(fromUserName, true);
  }

  if (messageType === "text" && isWechatLoginKeyword(content)) {
    const reply = await handleLoginKeyword(fromUserName);
    return toUserName ? textResponse(fromUserName, toUserName, reply) : successResponse();
  }

  if (sceneToken.startsWith(SCAN_LOGIN_PREFIX) && ["subscribe", "scan"].includes(event)) {
    const authorized = await authorizeScanLogin(sceneToken.slice(SCAN_LOGIN_PREFIX.length), fromUserName);
    if (authorized && toUserName) {
      return textResponse(fromUserName, toUserName, "登录成功，请返回浏览器继续使用烟火食间。");
    }
    return successResponse();
  }

  if (sceneToken && ["subscribe", "scan"].includes(event)) {
    const { data: binding } = await supabase
      .from("wechat_binding_tokens")
      .select("token_hash,user_id,expires_at,consumed_at")
      .eq("token_hash", hashToken(sceneToken))
      .is("consumed_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (binding) {
      const { data: existing } = await supabase
        .from("app_accounts")
        .select("user_id")
        .eq("wechat_openid", fromUserName)
        .maybeSingle();
      if (!existing || existing.user_id === binding.user_id) {
        const bindingAccountResult = await supabase
          .from("app_accounts")
          .select("auth_provider")
          .eq("user_id", binding.user_id)
          .maybeSingle();
        const authProvider = isMissingAccountColumnError(bindingAccountResult.error)
          ? "email"
          : bindingAccountResult.data?.auth_provider === "wechat"
            ? "wechat"
            : "mixed";
        const now = new Date().toISOString();
        let write = await supabase.from("app_accounts").upsert({
          user_id: binding.user_id,
          wechat_openid: fromUserName,
          wechat_status: "following",
          wechat_followed_at: now,
          wechat_status_checked_at: now,
          auth_provider: authProvider,
          updated_at: now,
        }, { onConflict: "user_id" });
        if (isMissingAccountColumnError(write.error)) {
          write = await supabase.from("app_accounts").upsert({
            user_id: binding.user_id,
            wechat_openid: fromUserName,
            wechat_status: "following",
            wechat_followed_at: now,
            updated_at: now,
          }, { onConflict: "user_id" });
        }
        if (!write.error) {
          await supabase.from("wechat_binding_tokens").update({ consumed_at: now }).eq("token_hash", binding.token_hash);
        }
      }
    }
  }

  if (["subscribe", "scan"].includes(event) && toUserName) {
    return textResponse(
      fromUserName,
      toUserName,
      "欢迎关注烟火食间！需要登录网页时，请直接回复【登录】，即可获取 6 位验证码。"
    );
  }

  return successResponse();
}
