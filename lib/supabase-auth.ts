import { createServerClient } from "@supabase/ssr";
import { createClient, type User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { cleanSupabaseConfigValue, supabaseAnonKeyValue, supabaseUrlValue, supabaseServer } from "@/lib/supabase";
import { isSyntheticWechatEmail } from "@/lib/wechat/account";
import {
  wechatFollowStatusFreshSeconds,
  wechatFollowStatusMaxStaleSeconds,
  wechatFollowStatusRefreshEnabled,
} from "@/lib/wechat/config";
import { queryWechatFollowStatus } from "@/lib/wechat/follow-status";

async function getCookieBackedUser() {
  const url = supabaseUrlValue();
  const anonKey = supabaseAnonKeyValue();
  if (!url || !anonKey) return null;

  const cookieStore = await cookies();
  const client = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server components can expose a read-only cookie store. API routes and middleware can still refresh it.
        }
      },
    },
  });

  const { data } = await client.auth.getUser();
  return data.user;
}

export async function getRequestUser(request: Request): Promise<User | null> {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  const url = supabaseUrlValue();
  const anonKey = supabaseAnonKeyValue();

  if (token && url && anonKey) {
    const client = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data } = await client.auth.getUser(token);
    return data.user;
  }

  try {
    return await getCookieBackedUser();
  } catch {
    return null;
  }
}

export type AppAccount = {
  wechat_status: "pending" | "following" | "unbound";
  wechat_openid: string | null;
  wechat_unionid: string | null;
  wechat_followed_at: string | null;
  wechat_status_checked_at: string | null;
  auth_provider: "email" | "wechat" | "mixed";
  disabled_at: string | null;
  disabled_reason: string | null;
};

export type HostedAccess = {
  user: User | null;
  account: AppAccount | null;
  allowed: boolean;
  wechatStatusRefreshFailed?: boolean;
  reason:
    | "authenticated"
    | "auth_required"
    | "wechat_follow_required"
    | "wechat_status_stale"
    | "account_disabled"
    | "database_not_configured"
    | "database_error";
};

const ACCOUNT_COLUMNS = "wechat_status,wechat_openid,wechat_unionid,wechat_followed_at,wechat_status_checked_at,auth_provider,disabled_at,disabled_reason";
const LEGACY_ACCOUNT_COLUMNS = "wechat_status,wechat_openid,wechat_unionid,wechat_followed_at";
type SupabaseServiceClient = NonNullable<ReturnType<typeof supabaseServer>>;
type LegacyAppAccount = Pick<AppAccount, "wechat_status" | "wechat_openid" | "wechat_unionid" | "wechat_followed_at">;

type AccountReadResult = {
  account: AppAccount | null;
  error: unknown | null;
  legacySchema: boolean;
};

export function isMissingAccountColumnError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: unknown; message?: unknown; details?: unknown };
  if (value.code === "42703" || value.code === "PGRST204") return true;

  const message = `${String(value.message || "")} ${String(value.details || "")}`.toLowerCase();
  return ["wechat_status_checked_at", "auth_provider", "disabled_at", "disabled_reason"]
    .some((column) => message.includes(column) && (message.includes("column") || message.includes("schema cache")));
}

function normalizeLegacyAccount(account: LegacyAppAccount): AppAccount {
  return {
    ...account,
    // 旧 schema 没有复核时间。迁移窗口内沿用已有关注状态，避免部署顺序造成旧用户突然失权。
    wechat_status_checked_at: new Date().toISOString(),
    auth_provider: "email",
    disabled_at: null,
    disabled_reason: null,
  };
}

async function readAccountByUserId(service: SupabaseServiceClient, userId: string): Promise<AccountReadResult> {
  const current = await service
    .from("app_accounts")
    .select(ACCOUNT_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();

  if (!current.error) {
    return { account: current.data as AppAccount | null, error: null, legacySchema: false };
  }
  if (!isMissingAccountColumnError(current.error)) {
    return { account: null, error: current.error, legacySchema: false };
  }

  const legacy = await service
    .from("app_accounts")
    .select(LEGACY_ACCOUNT_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();
  if (legacy.error) return { account: null, error: legacy.error, legacySchema: true };

  return {
    account: legacy.data ? normalizeLegacyAccount(legacy.data as LegacyAppAccount) : null,
    error: null,
    legacySchema: true,
  };
}

async function ensureAccount(user: User) {
  const service = supabaseServer();
  if (!service) return { service: null, account: null, error: "database_not_configured" as const };

  const existing = await readAccountByUserId(service, user.id);
  if (existing.error) return { service, account: null, error: "database_error" as const };
  if (existing.account) return { service, account: existing.account, error: null };

  const provider = isSyntheticWechatEmail(user) ? "wechat" : "email";
  const created = await service
    .from("app_accounts")
    .insert({ user_id: user.id, auth_provider: provider })
    .select(ACCOUNT_COLUMNS)
    .single();
  if (!created.error) return { service, account: created.data as AppAccount, error: null };

  if (isMissingAccountColumnError(created.error)) {
    const legacyCreated = await service
      .from("app_accounts")
      .insert({ user_id: user.id })
      .select(LEGACY_ACCOUNT_COLUMNS)
      .single();
    if (!legacyCreated.error) {
      return {
        service,
        account: normalizeLegacyAccount(legacyCreated.data as LegacyAppAccount),
        error: null,
      };
    }

    // 部分迁移或并发创建都可能表现为唯一键冲突，统一重新读取。
    if (legacyCreated.error.code !== "23505") {
      return { service, account: null, error: "database_error" as const };
    }
  } else if (created.error.code !== "23505") {
    return { service, account: null, error: "database_error" as const };
  }

  // 首次登录时多个并发请求可能同时创建账户。唯一键冲突后重新读取即可。
  const retried = await readAccountByUserId(service, user.id);
  if (!retried.error && retried.account) return { service, account: retried.account, error: null };

  return { service, account: null, error: "database_error" as const };
}

function secondsSince(value: string | null) {
  if (!value) return Number.POSITIVE_INFINITY;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? Math.max(0, (Date.now() - timestamp) / 1000) : Number.POSITIVE_INFINITY;
}

async function refreshWechatStatusIfNeeded(account: AppAccount, forceRefresh = false) {
  if (
    !wechatFollowStatusRefreshEnabled() ||
    !account.wechat_openid ||
    (!forceRefresh && secondsSince(account.wechat_status_checked_at) <= wechatFollowStatusFreshSeconds())
  ) {
    return { account, refreshFailed: false };
  }

  const service = supabaseServer();
  if (!service) return { account, refreshFailed: true };
  try {
    const result = await queryWechatFollowStatus(account.wechat_openid);
    const now = new Date().toISOString();
    const next: AppAccount = {
      ...account,
      wechat_status: result.status,
      wechat_followed_at: result.status === "following" ? result.followedAt || account.wechat_followed_at || now : null,
      wechat_status_checked_at: now,
    };
    await service.from("app_accounts").update({
      wechat_status: next.wechat_status,
      wechat_followed_at: next.wechat_followed_at,
      wechat_status_checked_at: now,
      updated_at: now,
    }).eq("wechat_openid", account.wechat_openid);
    return { account: next, refreshFailed: false };
  } catch (error) {
    console.error("WeChat follow status refresh failed", error instanceof Error ? error.message : "unknown");
    return { account, refreshFailed: true };
  }
}

export async function revalidateHostedAccessForUser(userId: string): Promise<Pick<HostedAccess, "allowed" | "reason">> {
  const service = supabaseServer();
  if (!service) return { allowed: false, reason: "database_not_configured" };

  const result = await readAccountByUserId(service, userId);
  if (result.error || !result.account) return { allowed: false, reason: "database_error" };

  const refreshed = await refreshWechatStatusIfNeeded(result.account);
  const account = refreshed.account;
  if (account.disabled_at) return { allowed: false, reason: "account_disabled" };
  if (refreshed.refreshFailed && secondsSince(account.wechat_status_checked_at) > wechatFollowStatusMaxStaleSeconds()) {
    return { allowed: false, reason: "wechat_status_stale" };
  }
  return account.wechat_status === "following"
    ? { allowed: true, reason: "authenticated" }
    : { allowed: false, reason: "wechat_follow_required" };
}

export async function getHostedAccess(
  request: Request,
  options: { forceWechatRefresh?: boolean } = {}
): Promise<HostedAccess> {
  const user = await getRequestUser(request);
  if (!user) {
    return { user: null, account: null, allowed: false, reason: "auth_required" };
  }

  const result = await ensureAccount(user);
  if (result.error === "database_not_configured") {
    return { user, account: null, allowed: false, reason: "database_not_configured" };
  }
  if (result.error === "database_error") {
    return { user, account: null, allowed: false, reason: "database_error" };
  }

  const refreshed = await refreshWechatStatusIfNeeded(
    result.account as AppAccount,
    Boolean(options.forceWechatRefresh)
  );
  const account = refreshed.account;
  if (account.disabled_at) return { user, account, allowed: false, reason: "account_disabled" };

  const tooStale = refreshed.refreshFailed && secondsSince(account.wechat_status_checked_at) > wechatFollowStatusMaxStaleSeconds();
  if (tooStale) return { user, account, allowed: false, reason: "wechat_status_stale" };

  const allowed = account.wechat_status === "following";
  return {
    user,
    account,
    allowed,
    wechatStatusRefreshFailed: refreshed.refreshFailed,
    reason: allowed ? "authenticated" : "wechat_follow_required",
  };
}

export function hostedAccessResponse(access: HostedAccess) {
  const status = access.reason === "auth_required"
    ? 401
    : access.reason === "database_not_configured" || access.reason === "database_error"
      ? 503
      : 403;
  const message = access.reason === "auth_required"
    ? "请先登录账户。"
    : access.reason === "wechat_follow_required"
      ? "请先关注微信公众号，才能使用线上模型和高德服务。"
      : access.reason === "wechat_status_stale"
        ? "公众号关注状态暂时无法复核，请稍后重试；你仍可使用自己的 Key。"
        : access.reason === "account_disabled"
          ? "当前账户的线上资源权限已停用。"
          : access.reason === "database_not_configured"
            ? "服务端数据库未配置，暂时无法校验账户权限。"
            : "账户权限校验失败，请稍后重试。";

  const code = access.reason === "auth_required"
    ? "AUTH_REQUIRED"
    : access.reason === "wechat_follow_required"
      ? "WECHAT_FOLLOW_REQUIRED"
      : access.reason === "wechat_status_stale"
        ? "WECHAT_STATUS_STALE"
        : access.reason === "account_disabled"
          ? "ACCOUNT_DISABLED"
          : "ACCESS_CHECK_FAILED";

  return Response.json({ error: { code, message } }, { status });
}

export function usesLocalModelConfig(config?: { enabled?: boolean; api_key?: string }) {
  return Boolean(config?.enabled && config.api_key?.trim());
}

export function hasWechatIntegrationConfig() {
  return Boolean(
    cleanSupabaseConfigValue(process.env.WECHAT_APP_ID) &&
    cleanSupabaseConfigValue(process.env.WECHAT_APP_SECRET) &&
    cleanSupabaseConfigValue(process.env.WECHAT_TOKEN)
  );
}
