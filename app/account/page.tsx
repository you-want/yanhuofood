"use client";

/* eslint-disable @next/next/no-img-element -- 微信公众号二维码来自运行时接口或部署配置。 */

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  Clock3,
  ExternalLink,
  KeyRound,
  Loader2,
  LogOut,
  MessageCircle,
  QrCode,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/AuthProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authCallbackErrorMessage, emailAuthRedirectUrl } from "@/lib/auth-redirect";
import { supabaseBrowserAuth } from "@/lib/supabase-auth-browser";

interface AccountInfo {
  authenticated: boolean;
  user: { id: string; email: string | null; authProvider: "email" | "wechat" | "mixed" } | null;
  access: {
    allowed: boolean;
    reason: string;
    modelConfigured: boolean;
    amapConfigured: boolean;
    modelHostedConfigured?: boolean;
    amapHostedConfigured?: boolean;
  };
  wechat: {
    configured: boolean;
    loginConfigured: boolean;
    scanLoginConfigured: boolean;
    codeLoginConfigured: boolean;
    followStatusRefreshEnabled: boolean;
    publicAccountName: string;
    codeLoginTtlSeconds: number;
    status: "unbound" | "pending" | "following";
    openidBound: boolean;
    followedAt: string | null;
    statusCheckedAt: string | null;
    statusRefreshFailed?: boolean;
  };
}

type ResourceStatusCardProps = {
  label: string;
  available: boolean;
  hostedConfigured: boolean;
  accessAllowed: boolean;
};

function ResourceStatusCard({ label, available, hostedConfigured, accessAllowed }: ResourceStatusCardProps) {
  const status = available
    ? { text: "已授权，可用", className: "text-primary" }
    : accessAllowed
      ? { text: "授权正常，服务端未配置", className: "text-warning" }
      : hostedConfigured
        ? { text: "服务已配置，等待账户授权", className: "text-warning" }
        : { text: "等待账户授权，且服务端未配置", className: "text-foreground" };

  return (
    <div className="rounded-lg bg-muted p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 font-medium ${status.className}`}>{status.text}</p>
    </div>
  );
}

type PublicAccountQr = {
  qrCodeUrl: string;
  expiresAt: string | null;
  accountName: string;
  source: "static" | "temporary";
};

type ScanLoginQr = {
  challengeId: string;
  displayCode: string;
  qrCodeUrl: string;
  expiresAt: string;
  accountName: string;
};

type ScanLoginStatus = {
  status: "pending" | "authorized" | "consuming" | "consumed" | "expired" | "failed";
  displayCode: string;
  expiresAt: string;
  failureCode: string | null;
};

async function getAccountInfo() {
  const response = await fetch("/api/account/me", { cache: "no-store" });
  return response.json() as Promise<AccountInfo>;
}

async function getPublicAccountQr() {
  const response = await fetch("/api/auth/wechat/code/qr", { cache: "no-store" });
  const payload = await response.json() as PublicAccountQr & { error?: { message?: string } };
  if (!response.ok || !payload.qrCodeUrl) throw new Error(payload.error?.message || "公众号二维码加载失败");
  return payload;
}

async function createScanLoginQr() {
  const response = await fetch("/api/auth/wechat/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ returnTo: "/account" }),
  });
  const payload = await response.json() as ScanLoginQr & { error?: { message?: string } };
  if (!response.ok || !payload.qrCodeUrl) throw new Error(payload.error?.message || "扫码登录二维码加载失败");
  return payload;
}

async function getScanLoginStatus(challengeId: string) {
  const response = await fetch(`/api/auth/wechat/login/status?challengeId=${encodeURIComponent(challengeId)}`, {
    cache: "no-store",
  });
  const payload = await response.json() as ScanLoginStatus & { error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message || "读取扫码登录状态失败");
  return payload;
}

function readableAuthError(error: unknown) {
  const authError = error && typeof error === "object"
    ? error as { code?: string; message?: string }
    : null;
  const code = authError?.code || "";
  const message = authError?.message || (typeof error === "string" ? error : "");

  if (code === "invalid_credentials" || message.includes("Invalid login credentials")) return "邮箱或密码不正确。";
  if (code === "email_not_confirmed" || message.includes("Email not confirmed")) return "邮箱还没有确认，请先完成邮箱确认后再登录。";
  if (code === "user_already_exists" || message.includes("already registered")) return "这个邮箱已经注册过，请直接登录。";
  if (code === "signup_disabled") return "邮箱注册暂未开放，请联系管理员。";
  if (code === "weak_password") return "密码强度不足，请换一个更安全的密码。";
  if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit") return "操作过于频繁，请稍后再试。";
  if (message.includes("Failed to fetch") || message.includes("NetworkError") || message.includes("Load failed")) {
    return "无法连接邮箱认证服务，请刷新页面后重试。";
  }
  return message || "操作失败，请稍后重试。";
}

export default function AccountPage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginCode, setLoginCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [codeBusy, setCodeBusy] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [qrExpiresAt, setQrExpiresAt] = useState<string | null>(null);
  const [bindingBusy, setBindingBusy] = useState(false);
  const [statusRefreshBusy, setStatusRefreshBusy] = useState(false);
  const [scanCompleting, setScanCompleting] = useState(false);
  const [scanCompletionFailed, setScanCompletionFailed] = useState(false);

  const accountQuery = useQuery({
    queryKey: ["account-info", user?.id || "anonymous"],
    queryFn: getAccountInfo,
    enabled: !authLoading,
    refetchInterval: qrCodeUrl ? 3000 : false,
    refetchOnWindowFocus: true,
  });
  const info = accountQuery.data;

  const publicQrQuery = useQuery({
    queryKey: ["wechat-code-login-qr"],
    queryFn: getPublicAccountQr,
    enabled: !authLoading && !user && !info?.wechat.scanLoginConfigured && Boolean(info?.wechat.codeLoginConfigured),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const scanQrQuery = useQuery({
    queryKey: ["wechat-scan-login-qr"],
    queryFn: createScanLoginQr,
    enabled: !authLoading && !user && Boolean(info?.wechat.scanLoginConfigured),
    staleTime: Infinity,
    retry: 1,
  });
  const scanChallengeId = scanQrQuery.data?.challengeId || "";
  const scanStatusQuery = useQuery({
    queryKey: ["wechat-scan-login-status", scanChallengeId],
    queryFn: () => getScanLoginStatus(scanChallengeId),
    enabled: Boolean(scanChallengeId) && !scanCompleting,
    refetchInterval: (query) => query.state.data?.status === "pending" ? 2000 : false,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
    const authMessage = authCallbackErrorMessage(
      url.searchParams.has("error") || url.searchParams.has("error_code") ? url.searchParams : hashParams
    );
    if (authMessage) {
      setMessage(authMessage);
      url.searchParams.delete("error");
      url.searchParams.delete("error_code");
      url.searchParams.delete("error_description");
      url.hash = "";
      window.history.replaceState({}, "", `${url.pathname}${url.search}`);
    }
  }, []);

  useEffect(() => {
    if (info?.wechat.status === "following") {
      setQrCodeUrl(null);
      setQrExpiresAt(null);
      void queryClient.invalidateQueries({ queryKey: ["model-status"] });
      void queryClient.invalidateQueries({ queryKey: ["nearby-map-status"] });
    }
  }, [info?.wechat.status, queryClient]);

  useEffect(() => {
    if (scanStatusQuery.data?.status !== "authorized" || scanCompleting || scanCompletionFailed) return;
    setScanCompleting(true);
    setMessage("扫码成功，正在建立登录状态...");
    void fetch("/api/auth/wechat/login/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challengeId: scanChallengeId }),
    })
      .then(async (response) => {
        const payload = await response.json() as { ok?: boolean; returnTo?: string; error?: { message?: string } };
        if (!response.ok || !payload.ok) throw new Error(payload.error?.message || "扫码登录失败");
        window.location.assign(payload.returnTo || "/account");
      })
      .catch((error) => {
        setMessage(error instanceof Error ? error.message : "扫码登录失败，请刷新二维码后重试。");
        setScanCompleting(false);
        setScanCompletionFailed(true);
      });
  }, [scanChallengeId, scanCompleting, scanCompletionFailed, scanStatusQuery.data?.status]);

  async function submitCodeLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d{6}$/.test(loginCode)) {
      setMessage("请输入公众号发送的 6 位数字验证码。");
      return;
    }

    setCodeBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/wechat/code/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: loginCode, returnTo: "/account" }),
      });
      const payload = await response.json() as { ok?: boolean; returnTo?: string; error?: { message?: string } };
      if (!response.ok || !payload.ok) throw new Error(payload.error?.message || "验证码登录失败");
      window.location.assign(payload.returnTo || "/account");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "验证码登录失败，请稍后重试。");
      setCodeBusy(false);
    }
  }

  async function submitAuth(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const client = supabaseBrowserAuth();
    if (!client) {
      setMessage("Supabase 尚未配置，暂时无法登录。请先配置 NEXT_PUBLIC_SUPABASE_URL 和 NEXT_PUBLIC_SUPABASE_ANON_KEY。");
      return;
    }
    if (!email.trim() || password.length < 6) {
      setMessage("请输入邮箱，并使用至少 6 位密码。");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const result = mode === "login"
        ? await client.auth.signInWithPassword({ email: normalizedEmail, password })
        : await client.auth.signUp({
            email: normalizedEmail,
            password,
            options: { emailRedirectTo: emailAuthRedirectUrl() },
          });
      if (result.error) throw result.error;
      setPassword("");
      setMessage(mode === "signup" && !result.data.session ? "注册成功。请先完成邮箱确认，再回来登录。" : "登录成功。");
    } catch (error) {
      setMessage(readableAuthError(error));
    } finally {
      setBusy(false);
    }
  }

  async function resendConfirmation() {
    const client = supabaseBrowserAuth();
    const normalizedEmail = email.trim().toLowerCase();
    if (!client) {
      setMessage("邮箱认证服务尚未正确配置，请联系管理员。");
      return;
    }
    if (!normalizedEmail) {
      setMessage("请先填写需要验证的邮箱地址。");
      return;
    }

    setResendBusy(true);
    setMessage(null);
    try {
      const { error } = await client.auth.resend({
        type: "signup",
        email: normalizedEmail,
        options: { emailRedirectTo: emailAuthRedirectUrl() },
      });
      if (error) throw error;
      setMessage("验证邮件已重新发送。请只使用最新邮件中的验证链接。");
    } catch (error) {
      setMessage(readableAuthError(error));
    } finally {
      setResendBusy(false);
    }
  }

  async function refreshWechatStatus() {
    setStatusRefreshBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/account/me?refreshWechat=1", { cache: "no-store" });
      const payload = await response.json() as AccountInfo & { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message || "关注状态复核失败");
      queryClient.setQueryData(["account-info", user?.id || "anonymous"], payload);
      setMessage(
        payload.wechat.statusRefreshFailed
          ? "微信关注状态实时查询失败，当前继续使用最近一次已确认状态，请稍后再试。"
          : payload.access.allowed
            ? "公众号关注状态已重新确认，账户授权正常。"
            : "已完成复核，但当前账户仍未获得公共额度权限。"
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "关注状态复核失败，请稍后重试。");
    } finally {
      setStatusRefreshBusy(false);
    }
  }

  async function createBindingQr() {
    setBindingBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/wechat/bind", { method: "POST" });
      const payload = await response.json() as { qrCodeUrl?: string; expiresAt?: string; error?: { message?: string } };
      if (!response.ok || !payload.qrCodeUrl) throw new Error(payload.error?.message || "二维码创建失败");
      setQrCodeUrl(payload.qrCodeUrl);
      setQrExpiresAt(payload.expiresAt || null);
      await accountQuery.refetch();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "二维码创建失败，请稍后重试。");
    } finally {
      setBindingBusy(false);
    }
  }

  if (authLoading || accountQuery.isPending) {
    return <main className="mx-auto max-w-[1100px] px-4 py-12"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />正在读取账户状态...</div></main>;
  }

  if (!user) {
    const accountName = scanQrQuery.data?.accountName || publicQrQuery.data?.accountName || info?.wechat.publicAccountName || "烟火食间";
    const scanStatus = scanStatusQuery.data?.status;
    const loginQrUrl = scanQrQuery.data?.qrCodeUrl || publicQrQuery.data?.qrCodeUrl;
    const qrPending = info?.wechat.scanLoginConfigured ? scanQrQuery.isPending : publicQrQuery.isPending;
    const qrError = info?.wechat.scanLoginConfigured ? scanQrQuery.error : publicQrQuery.error;
    const refreshScanQr = () => {
      setScanCompleting(false);
      setScanCompletionFailed(false);
      setMessage(null);
      void scanQrQuery.refetch();
    };
    return (
      <main className="mx-auto max-w-[1100px] px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <section className="mx-auto max-w-2xl">
          <PageHeader
            eyebrow={<Badge>资源访问账户</Badge>}
            title="登录烟火食间"
            description="登录后可以使用站点公共模型和附近地图额度；也可以继续使用本浏览器的本地配置。"
          />

          <Card className="overflow-hidden">
            <CardHeader className="border-b border-primary/10 bg-primary/10">
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-[#07c160]" />
                {info?.wechat.scanLoginConfigured ? "公众号扫码登录" : "公众号验证码登录"}
              </CardTitle>
              <CardDescription>
                {info?.wechat.scanLoginConfigured
                  ? "微信扫码关注后自动登录，并开放当前账户的公共额度。"
                  : "关注公众号并回复关键词，无需微信网页授权即可登录。"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5 pt-6">
              {!info?.wechat.scanLoginConfigured && !info?.wechat.codeLoginConfigured && (
                <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm leading-6 text-warning">
                  管理员尚未完成公众号登录配置，你仍可以使用下方邮箱入口。
                </div>
              )}

              <div className="grid gap-5 md:grid-cols-[240px_1fr]">
                <div className="flex min-h-60 items-center justify-center rounded-xl border border-border bg-muted p-3 text-center">
                  {qrPending ? (
                    <div className="text-sm text-muted-foreground"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />正在创建登录二维码...</div>
                  ) : loginQrUrl ? (
                    <div>
                      <img src={loginQrUrl} alt={`${accountName}公众号登录二维码`} className="mx-auto h-52 w-52 rounded-lg bg-card object-contain" />
                      {scanCompleting || scanStatus === "authorized" ? (
                        <p className="mt-2 text-xs font-medium text-primary">扫码成功，正在登录...</p>
                      ) : scanStatus === "expired" || scanStatus === "failed" || scanCompletionFailed ? (
                        <p className="mt-2 text-xs font-medium text-warning">二维码已失效，请刷新</p>
                      ) : (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {info?.wechat.scanLoginConfigured ? "等待微信扫码，二维码仅限本次登录" : "扫码关注后，请在公众号回复【登录】"}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3 text-sm text-muted-foreground">
                      <QrCode className="mx-auto h-10 w-10 text-muted-foreground" />
                      <p>{qrError instanceof Error ? qrError.message : `请在微信中搜索“${accountName}”`}</p>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <ol className="space-y-3 text-sm text-foreground">
                    <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">1</span><span className="pt-0.5">使用微信扫码关注公众号 <strong className="text-foreground">{accountName}</strong></span></li>
                    {info?.wechat.scanLoginConfigured ? (
                      <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">2</span><span className="pt-0.5">关注或确认扫码后，本页会自动完成登录</span></li>
                    ) : (
                      <>
                        <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">2</span><span className="pt-0.5">在公众号对话中回复【登录】</span></li>
                        <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">3</span><span className="pt-0.5">将收到的 6 位验证码填入下方</span></li>
                      </>
                    )}
                  </ol>

                  {(scanStatus === "expired" || scanStatus === "failed" || scanQrQuery.isError || scanCompletionFailed) && info?.wechat.scanLoginConfigured && (
                    <Button type="button" variant="outline" className="w-full" onClick={refreshScanQr}>
                      <RefreshCw className="h-4 w-4" />刷新登录二维码
                    </Button>
                  )}

                  {info?.wechat.codeLoginConfigured && (
                    <details open={!info?.wechat.scanLoginConfigured} className="group rounded-lg border border-border bg-card">
                      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium text-foreground">
                        扫码未成功？使用验证码登录
                        <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                      </summary>
                      <form className="space-y-3 border-t border-border p-4" onSubmit={submitCodeLogin}>
                        <p className="text-xs leading-5 text-muted-foreground">在公众号对话中回复【登录】，将收到的 6 位验证码填入下方。</p>
                        <div className="space-y-2">
                          <Label htmlFor="wechat-code">公众号验证码</Label>
                          <Input
                            id="wechat-code"
                            name="wechat-code"
                            value={loginCode}
                            onChange={(event) => setLoginCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            pattern="[0-9]{6}"
                            maxLength={6}
                            placeholder="请输入 6 位验证码"
                            className="h-12 text-center font-mono text-xl tracking-[0.35em]"
                            required
                          />
                        </div>
                        <Button className="w-full bg-[#07c160] text-white hover:bg-[#06ad56]" type="submit" disabled={codeBusy || loginCode.length !== 6}>
                          {codeBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                          验证并登录
                        </Button>
                      </form>
                    </details>
                  )}
                </div>
              </div>

              <p className="text-xs leading-5 text-muted-foreground">登录二维码与验证码都只能使用一次。扫码成功后即视为已完成公众号关注授权，可使用站点公共额度。</p>

              <details open className="group rounded-lg border border-border bg-muted">
                <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium text-foreground">
                  使用邮箱登录或注册
                  <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                </summary>
                <form className="space-y-4 border-t border-border p-4" onSubmit={submitAuth}>
                  <div className="space-y-2"><Label htmlFor="email">邮箱</Label><Input id="email" name="email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></div>
                  <div className="space-y-2"><Label htmlFor="password">密码</Label><Input id="password" name="password" type="password" required minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} /></div>
                  <Button className="w-full" type="submit" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{mode === "login" ? "邮箱登录" : "创建邮箱账户"}</Button>
                  <div className="grid gap-2 text-center text-sm">
                    <button type="button" className="text-primary hover:underline" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMessage(null); }}>
                      {mode === "login" ? "没有账户？注册一个" : "已有账户？返回登录"}
                    </button>
                    <button type="button" className="text-muted-foreground hover:text-primary hover:underline" onClick={() => void resendConfirmation()} disabled={resendBusy}>
                      {resendBusy ? "正在重新发送验证邮件..." : "验证链接无效或过期？重新发送"}
                    </button>
                  </div>
                </form>
              </details>

              {message && <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm leading-6 text-warning">{message}</div>}
            </CardContent>
          </Card>
        </section>
      </main>
    );
  }

  const following = info?.wechat.status === "following";
  const accessAllowed = Boolean(info?.access.allowed);
  const modelHostedConfigured = info?.access.modelHostedConfigured ?? Boolean(info?.access.modelConfigured);
  const amapHostedConfigured = info?.access.amapHostedConfigured ?? Boolean(info?.access.amapConfigured);
  const accessSummary = accessAllowed
    ? {
        title: "账户授权已生效",
        description: "公众号关注状态已确认；已配置的线上资源可直接使用。",
        className: "border-primary/20 bg-primary/10",
        icon: <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />,
      }
    : info?.access.reason === "wechat_status_stale"
      ? {
          title: "暂时无法复核公众号关注状态",
          description: "微信状态查询暂时失败，可点击右侧重新校验；其间仍可使用自己的 Key。",
          className: "border-warning/30 bg-warning/10",
          icon: <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-warning" />,
        }
      : info?.access.reason === "account_disabled"
        ? {
            title: "当前账户的公共额度权限已停用",
            description: "公众号仍可能处于关注状态，但账户权限已被停用，请联系管理员。",
            className: "border-destructive/30 bg-destructive/10",
            icon: <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />,
          }
        : info?.access.reason === "database_error" || info?.access.reason === "database_not_configured"
          ? {
              title: "账户权限暂时无法校验",
              description: "服务端账户数据读取失败，请稍后刷新；现在仍可使用自己的 Key。",
              className: "border-destructive/30 bg-destructive/10",
              icon: <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />,
            }
          : {
              title: "已登录，但尚未获得公共额度权限",
              description: "关注并绑定右侧公众号后即可解锁；现在仍可使用自己的模型和高德 Key。",
              className: "border-warning/30 bg-warning/10",
              icon: <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-warning" />,
            };
  const providerLabel = info?.user?.authProvider === "wechat" ? "公众号登录" : info?.user?.authProvider === "mixed" ? "邮箱 + 公众号" : "邮箱登录";
  return (
    <main className="mx-auto max-w-[1100px] px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <PageHeader
        eyebrow={<Badge>账户中心</Badge>}
        title="资源访问与公众号授权"
        description="查看当前账户能使用的服务，并完成公众号关注授权。"
        actions={<Button variant="outline" onClick={() => void signOut()}><LogOut className="h-4 w-4" />退出登录</Button>}
      />
      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" />当前账户</CardTitle><CardDescription>{info?.user?.email || providerLabel}</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2"><Badge variant="secondary">{providerLabel}</Badge><Badge variant={following ? "default" : "amber"}>{following ? "公众号已关注" : "公众号未关注"}</Badge></div>
            <div className={`rounded-lg border p-4 ${accessSummary.className}`}>
              <div className="flex items-start gap-3">
                {accessSummary.icon}
                <div>
                  <p className="font-medium text-foreground">{accessSummary.title}</p>
                  <p className="mt-1 text-sm leading-6 text-foreground">{accessSummary.description}</p>
                </div>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <ResourceStatusCard
                label="线上大模型"
                available={Boolean(info?.access.modelConfigured)}
                hostedConfigured={modelHostedConfigured}
                accessAllowed={accessAllowed}
              />
              <ResourceStatusCard
                label="高德 WebService Key"
                available={Boolean(info?.access.amapConfigured)}
                hostedConfigured={amapHostedConfigured}
                accessAllowed={accessAllowed}
              />
            </div>
            <p className="text-xs leading-5 text-muted-foreground">服务端不会把 OPENAI_API_KEY、AMAP_WEB_SERVICE_KEY、微信 AppSecret 或 service role key 返回到浏览器。</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><QrCode className="h-5 w-5 text-primary" />微信公众号授权</CardTitle><CardDescription>扫码关注后，系统收到微信事件即可自动开放公共额度。</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            {!info?.wechat.configured && <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm leading-6 text-destructive">管理员还没有配置微信公众号回调参数，暂时无法生成关注二维码。</div>}
            {following ? (
              <div className="rounded-lg border border-primary/20 bg-primary/10 p-4 text-sm leading-6 text-primary">
                <p className="font-medium">已确认关注</p>
                <p className="mt-1">以后退出登录后，可在公众号回复【登录】获取验证码。</p>
                {info?.wechat.statusCheckedAt && <p className="mt-2 text-xs text-primary">最近确认：{new Date(info.wechat.statusCheckedAt).toLocaleString("zh-CN")}</p>}
                {info?.wechat.openidBound && info?.wechat.followStatusRefreshEnabled && (
                  <Button type="button" size="sm" variant="outline" className="mt-3 bg-card" onClick={() => void refreshWechatStatus()} disabled={statusRefreshBusy}>
                    {statusRefreshBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    重新校验关注状态
                  </Button>
                )}
              </div>
            ) : (
              <>
                <div className="grid gap-2">
                  <Button className="w-full" onClick={createBindingQr} disabled={bindingBusy || !info?.wechat.configured}>{bindingBusy && <Loader2 className="h-4 w-4 animate-spin" />}{info?.wechat.status === "pending" ? "重新生成关注二维码" : "生成关注二维码"}</Button>
                  {info?.wechat.openidBound && info?.wechat.followStatusRefreshEnabled && (
                    <Button type="button" className="w-full" variant="outline" onClick={() => void refreshWechatStatus()} disabled={statusRefreshBusy}>
                      {statusRefreshBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      已经关注？重新校验状态
                    </Button>
                  )}
                </div>
                {qrCodeUrl && <div className="rounded-lg border border-border bg-muted p-4 text-center"><img src={qrCodeUrl} alt="微信公众号关注二维码" className="mx-auto h-56 w-56 rounded-lg bg-card object-contain" /><p className="mt-3 text-sm font-medium text-foreground">请用微信扫码并关注公众号</p>{qrExpiresAt && <p className="mt-1 text-xs text-muted-foreground">二维码有效期至 {new Date(qrExpiresAt).toLocaleTimeString("zh-CN")}</p>}<p className="mt-2 text-xs text-muted-foreground">完成后本页会自动刷新授权状态。</p></div>}
                <a className="inline-flex items-center gap-1 text-sm text-primary hover:underline" href="/guide"><ExternalLink className="h-3.5 w-3.5" />查看使用说明</a>
              </>
            )}
            {message && <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm leading-6 text-warning">{message}</div>}
          </CardContent>
        </Card>
      </div>
      <div className="mt-5 flex items-center gap-2 text-xs text-muted-foreground"><Badge variant={accessAllowed ? "default" : "amber"}>{accessAllowed ? "账户已授权" : "只能使用自己的 Key"}</Badge><span>账户授权与服务端资源配置会分别显示，授权判断仍在服务端完成。</span></div>
    </main>
  );
}
