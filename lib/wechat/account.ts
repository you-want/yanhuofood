import { randomBytes } from "node:crypto";
import type { User } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase";
import { wechatSubjectHash } from "@/lib/wechat/crypto";
import type { WechatFollowResult } from "@/lib/wechat/follow-status";

export class WechatAccountError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "WechatAccountError";
    this.code = code;
  }
}

type AccountRow = {
  user_id: string;
  wechat_openid: string | null;
  wechat_unionid: string | null;
  wechat_status: "unbound" | "pending" | "following";
  wechat_followed_at: string | null;
  wechat_status_checked_at?: string | null;
  auth_provider?: "email" | "wechat" | "mixed";
};

function syntheticWechatEmail(openid: string) {
  return `wx_${wechatSubjectHash(openid)}@wechat-login.invalid`;
}

async function upsertAccount(values: Record<string, unknown>) {
  const supabase = supabaseServer();
  if (!supabase) throw new WechatAccountError("DATABASE_NOT_CONFIGURED", "Supabase service role 未配置");
  const result = await supabase.from("app_accounts").upsert(values, { onConflict: "user_id" });
  if (result.error) throw new WechatAccountError("WECHAT_ACCOUNT_WRITE_FAILED", result.error.message);
}

export async function findOrCreateWechatUser(input: {
  openid: string;
  unionid?: string | null;
  currentUser?: User | null;
}) {
  const supabase = supabaseServer();
  if (!supabase) throw new WechatAccountError("DATABASE_NOT_CONFIGURED", "Supabase service role 未配置");

  const existing = await supabase
    .from("app_accounts")
    .select("user_id,wechat_openid,wechat_unionid,wechat_status,wechat_followed_at,wechat_status_checked_at,auth_provider")
    .eq("wechat_openid", input.openid)
    .maybeSingle();
  if (existing.error) throw new WechatAccountError("WECHAT_ACCOUNT_READ_FAILED", existing.error.message);
  if (existing.data) return { userId: existing.data.user_id as string, created: false };

  if (input.currentUser) {
    const current = await supabase
      .from("app_accounts")
      .select("user_id,wechat_openid,wechat_unionid,auth_provider")
      .eq("user_id", input.currentUser.id)
      .maybeSingle();
    if (current.error) throw new WechatAccountError("WECHAT_ACCOUNT_READ_FAILED", current.error.message);
    if (current.data?.wechat_openid && current.data.wechat_openid !== input.openid) {
      throw new WechatAccountError("WECHAT_ACCOUNT_CONFLICT", "当前账户已经绑定了另一个微信账号");
    }
    await upsertAccount({
      user_id: input.currentUser.id,
      wechat_openid: input.openid,
      wechat_unionid: input.unionid || current.data?.wechat_unionid || null,
      auth_provider: current.data?.auth_provider === "wechat" ? "wechat" : "mixed",
      updated_at: new Date().toISOString(),
    });
    return { userId: input.currentUser.id, created: false };
  }

  const email = syntheticWechatEmail(input.openid);
  const created = await supabase.auth.admin.createUser({
    email,
    password: randomBytes(32).toString("base64url"),
    email_confirm: true,
    user_metadata: {
      auth_provider: "wechat",
      wechat_subject_hash: wechatSubjectHash(input.openid),
      synthetic_email: true,
    },
  });
  if (created.error || !created.data.user) {
    throw new WechatAccountError("WECHAT_USER_CREATE_FAILED", created.error?.message || "创建微信账户失败");
  }

  const userId = created.data.user.id;
  const insert = await supabase.from("app_accounts").insert({
    user_id: userId,
    wechat_openid: input.openid,
    wechat_unionid: input.unionid || null,
    wechat_status: "unbound",
    auth_provider: "wechat",
    updated_at: new Date().toISOString(),
  });
  if (!insert.error) return { userId, created: true };

  const raced = await supabase
    .from("app_accounts")
    .select("user_id")
    .eq("wechat_openid", input.openid)
    .maybeSingle();
  if (raced.data?.user_id) {
    await supabase.auth.admin.deleteUser(userId);
    return { userId: raced.data.user_id as string, created: false };
  }

  await supabase.auth.admin.deleteUser(userId);
  throw new WechatAccountError("WECHAT_ACCOUNT_WRITE_FAILED", insert.error.message);
}

export async function updateWechatFollowState(input: {
  userId: string;
  openid: string;
  unionid?: string | null;
  result: WechatFollowResult;
}) {
  const now = new Date().toISOString();
  const values: Record<string, unknown> = {
    user_id: input.userId,
    wechat_openid: input.openid,
    wechat_status: input.result.status,
    wechat_followed_at: input.result.status === "following" ? input.result.followedAt || now : null,
    wechat_status_checked_at: now,
    updated_at: now,
  };
  // OAuth 的 snsapi_base 响应不一定包含 UnionID，缺失时保留数据库中的已有值。
  if (input.unionid) values.wechat_unionid = input.unionid;
  await upsertAccount(values);
}

export function isSyntheticWechatEmail(user: Pick<User, "email" | "user_metadata">) {
  return Boolean(user.user_metadata?.synthetic_email) || /@wechat-login\.invalid$/i.test(user.email || "");
}

export type { AccountRow };
