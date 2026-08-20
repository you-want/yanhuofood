"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function WechatLoginConfirm({ challengeId, displayCode }: { challengeId: string; displayCode: string }) {
  const [status, setStatus] = useState<"idle" | "busy" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function confirm() {
    setStatus("busy");
    setMessage(null);
    try {
      const response = await fetch("/api/auth/wechat/login/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId }),
      });
      const payload = await response.json() as { ok?: boolean; error?: { message?: string } };
      if (!response.ok || !payload.ok) throw new Error(payload.error?.message || "确认登录失败");
      setStatus("success");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "确认登录失败，请重新扫码。");
    }
  }

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-lg items-center px-4 py-10 sm:px-6">
      <Card className="w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 rounded-2xl bg-primary/10 p-3 text-primary">
            {status === "success" ? <CheckCircle2 className="h-7 w-7" /> : <ShieldCheck className="h-7 w-7" />}
          </div>
          <CardTitle>{status === "success" ? "登录已确认" : "确认登录烟火食间"}</CardTitle>
          <CardDescription>
            {status === "success" ? "电脑端正在完成登录，你可以关闭当前页面。" : "请确认电脑上显示的校验码与下方一致。"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-xl border border-primary/20 bg-primary/10 px-4 py-5 text-center">
            <p className="text-xs font-medium uppercase tracking-[0.25em] text-primary">登录校验码</p>
            <p className="mt-2 font-mono text-3xl font-semibold tracking-[0.3em] text-foreground">{displayCode}</p>
          </div>
          {status !== "success" && (
            <Button className="w-full" size="lg" onClick={confirm} disabled={status === "busy" || !challengeId}>
              {status === "busy" && <Loader2 className="h-4 w-4 animate-spin" />}
              确认登录
            </Button>
          )}
          {message && <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{message}</div>}
          <p className="text-center text-xs leading-5 text-muted-foreground">如果你没有在电脑上发起登录，请不要确认，并直接关闭本页。</p>
        </CardContent>
      </Card>
    </main>
  );
}
