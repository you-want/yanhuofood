import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAnonKeyValue, supabaseServer, supabaseUrlValue } from "@/lib/supabase";

export class WechatSessionError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "WechatSessionError";
    this.code = code;
  }
}

export async function issueSupabaseSessionForUser(userId: string) {
  const service = supabaseServer();
  const url = supabaseUrlValue();
  const anonKey = supabaseAnonKeyValue();
  if (!service || !url || !anonKey) {
    throw new WechatSessionError("DATABASE_NOT_CONFIGURED", "Supabase 登录配置不完整");
  }

  const found = await service.auth.admin.getUserById(userId);
  const email = found.data.user?.email;
  if (found.error || !email) {
    throw new WechatSessionError("WECHAT_USER_NOT_FOUND", found.error?.message || "微信账户不存在");
  }

  const link = await service.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link.data.properties?.hashed_token;
  if (link.error || !tokenHash) {
    throw new WechatSessionError("AUTH_LINK_FAILED", link.error?.message || "无法生成一次性登录凭证");
  }

  const cookieStore = await cookies();
  const auth = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
      },
    },
  });
  const verified = await auth.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
  if (verified.error || verified.data.user?.id !== userId || !verified.data.session) {
    throw new WechatSessionError("AUTH_SESSION_ISSUE_FAILED", verified.error?.message || "建立登录 Session 失败");
  }
  return verified.data.session;
}
