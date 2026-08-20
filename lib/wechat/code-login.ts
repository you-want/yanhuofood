import { createHmac } from "node:crypto";
import { createDisplayCode } from "@/lib/wechat/crypto";
import {
  wechatCodeLoginCooldownSeconds,
  wechatCodeLoginTtlSeconds,
  wechatLoginHmacSecret,
} from "@/lib/wechat/config";
import { supabaseServer } from "@/lib/supabase";

export type WechatLoginCode = {
  id: string;
  user_id: string;
  wechat_openid: string;
  status: "pending" | "consuming" | "consumed" | "expired" | "failed";
  expires_at: string;
  consumed_at: string | null;
  failure_code: string | null;
};

export class WechatCodeLoginError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "WechatCodeLoginError";
    this.code = code;
  }
}

function hmacPurposeValue(purpose: string, value: string) {
  const secret = wechatLoginHmacSecret();
  if (!secret) throw new WechatCodeLoginError("WECHAT_CODE_LOGIN_NOT_CONFIGURED", "公众号验证码登录密钥未配置");
  return createHmac("sha256", secret).update(`${purpose}:${value}`).digest("hex");
}

export function hashWechatLoginCode(code: string) {
  return hmacPurposeValue("login-code", code);
}

export function hashWechatLoginClient(value: string) {
  return hmacPurposeValue("login-client", value);
}

export function isWechatLoginKeyword(content: string) {
  const normalized = content.trim().replace(/[【】\[\]\s]/g, "").toLowerCase();
  return ["登录", "登陆", "登录验证码", "login"].includes(normalized);
}

export async function createWechatLoginCode(input: { userId: string; openid: string }) {
  const supabase = supabaseServer();
  if (!supabase) throw new WechatCodeLoginError("DATABASE_NOT_CONFIGURED", "Supabase service role 未配置");

  const now = new Date();
  const cooldownThreshold = new Date(now.getTime() - wechatCodeLoginCooldownSeconds() * 1000).toISOString();
  const active = await supabase
    .from("wechat_login_codes")
    .select("created_at")
    .eq("wechat_openid", input.openid)
    .eq("status", "pending")
    .gt("expires_at", now.toISOString())
    .gt("created_at", cooldownThreshold)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (active.error) throw new WechatCodeLoginError("WECHAT_CODE_READ_FAILED", active.error.message);
  if (active.data) {
    throw new WechatCodeLoginError("WECHAT_CODE_COOLDOWN", "验证码刚刚已经发送，请使用上一条消息中的验证码");
  }

  await supabase
    .from("wechat_login_codes")
    .update({ status: "expired", updated_at: now.toISOString() })
    .eq("wechat_openid", input.openid)
    .eq("status", "pending");

  const expiresAt = new Date(now.getTime() + wechatCodeLoginTtlSeconds() * 1000).toISOString();
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = createDisplayCode();
    const inserted = await supabase.from("wechat_login_codes").insert({
      code_hash: hashWechatLoginCode(code),
      user_id: input.userId,
      wechat_openid: input.openid,
      expires_at: expiresAt,
      updated_at: now.toISOString(),
    });
    if (!inserted.error) return { code, expiresAt };
    if (inserted.error.code !== "23505") {
      throw new WechatCodeLoginError("WECHAT_CODE_CREATE_FAILED", inserted.error.message);
    }
  }

  throw new WechatCodeLoginError("WECHAT_CODE_COLLISION", "验证码生成冲突，请稍后重试");
}

export async function claimWechatLoginCode(code: string) {
  const supabase = supabaseServer();
  if (!supabase) throw new WechatCodeLoginError("DATABASE_NOT_CONFIGURED", "Supabase service role 未配置");
  const now = new Date().toISOString();
  const claimed = await supabase
    .from("wechat_login_codes")
    .update({ status: "consuming", updated_at: now })
    .eq("code_hash", hashWechatLoginCode(code))
    .eq("status", "pending")
    .gt("expires_at", now)
    .select("id,user_id,wechat_openid,status,expires_at,consumed_at,failure_code")
    .maybeSingle();
  if (claimed.error) throw new WechatCodeLoginError("WECHAT_CODE_READ_FAILED", claimed.error.message);
  return claimed.data as WechatLoginCode | null;
}

export async function finishWechatLoginCode(id: string, success: boolean, failureCode?: string) {
  const supabase = supabaseServer();
  if (!supabase) return;
  const now = new Date().toISOString();
  await supabase.from("wechat_login_codes").update({
    status: success ? "consumed" : "failed",
    consumed_at: success ? now : null,
    failure_code: success ? null : (failureCode || "SESSION_ISSUE_FAILED").slice(0, 120),
    updated_at: now,
  }).eq("id", id).eq("status", "consuming");
}
