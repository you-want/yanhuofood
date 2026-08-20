"use client";

import { AlertCircle, BrainCircuit, CheckCircle2, Eye, EyeOff, HelpCircle, Loader2, PlugZap, RefreshCw, Save, ServerCog, Trash2, XCircle } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectNative } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DEFAULT_LOCAL_MODEL_CONFIG, clearLocalModelConfig, readLocalModelConfig, saveLocalModelConfig } from "@/lib/local-model-config";
import type { LocalModelConfig, ModelProvider } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";

type ModelTestResult = {
  ok: boolean;
  provider?: string;
  model?: string;
  latencyMs?: number;
  sample?: string;
  error?: string;
};

type ModelStatus = {
  server: {
    configured: boolean;
    hostedConfigured?: boolean;
    access?: { allowed: boolean; reason: string };
    model: string;
    baseUrlConfigured: boolean;
    provider: ModelProvider;
  };
};

function HelpTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label="查看说明"
          onClick={() => setOpen((value) => !value)}
          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <HelpCircle className="h-4 w-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  );
}

function Field({ label, help, children, className }: { label: string; help: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("grid gap-2", className)}>
      <div className="flex items-center gap-1.5">
        <Label className="text-sm font-medium text-foreground">{label}</Label>
        <HelpTip text={help} />
      </div>
      {children}
    </div>
  );
}

function SwitchField({
  title,
  description,
  help,
  checked,
  onCheckedChange,
}: {
  title: string;
  description: string;
  help: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted px-3 py-3 transition hover:border-primary/30 hover:bg-primary/10">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium text-foreground">{title}</p>
          <HelpTip text={help} />
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

export default function ModelSettingsPage() {
  const [localModelConfig, setLocalModelConfig] = useState<LocalModelConfig>(DEFAULT_LOCAL_MODEL_CONFIG);
  const [savedLocalModelConfig, setSavedLocalModelConfig] = useState<LocalModelConfig>(DEFAULT_LOCAL_MODEL_CONFIG);
  const [localModelSaved, setLocalModelSaved] = useState(false);
  const [modelTestResult, setModelTestResult] = useState<ModelTestResult | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);

  useEffect(() => {
    const stored = readLocalModelConfig();
    setLocalModelConfig(stored);
    setSavedLocalModelConfig(stored);
  }, []);

  const modelStatus = useQuery({
    queryKey: ["model-status"],
    queryFn: async () => {
      const res = await fetch("/api/model/test", { cache: "no-store" });
      if (!res.ok) throw new Error("读取模型状态失败");
      return res.json() as Promise<ModelStatus>;
    },
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: (query) => {
      const status = query.state.data as ModelStatus | undefined;
      return status?.server.hostedConfigured && !status.server.configured ? 3000 : false;
    },
  });

  const testModel = useMutation({
    mutationFn: async () => {
      setModelTestResult(null);
      const res = await fetch("/api/model/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model_config: localModelConfig }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "模型连接测试失败");
      }
      return data as ModelTestResult;
    },
    onSuccess: (result) => {
      setModelTestResult(result);
    },
    onError: (error) => {
      setModelTestResult({
        ok: false,
        error: error instanceof Error ? error.message : "模型连接测试失败",
      });
    },
  });

  const handleSaveLocalModel = () => {
    saveLocalModelConfig(localModelConfig);
    setSavedLocalModelConfig(localModelConfig);
    setLocalModelSaved(true);
    setModelTestResult(null);
    window.setTimeout(() => setLocalModelSaved(false), 2000);
  };

  const handleClearLocalModel = () => {
    clearLocalModelConfig();
    setLocalModelConfig(DEFAULT_LOCAL_MODEL_CONFIG);
    setSavedLocalModelConfig(DEFAULT_LOCAL_MODEL_CONFIG);
    setLocalModelSaved(false);
    setModelTestResult(null);
  };

  const savedLocalHasKey = !!savedLocalModelConfig.api_key?.trim();
  const savedLocalActive = savedLocalModelConfig.enabled && savedLocalHasKey;
  const serverConfigured = !!modelStatus.data?.server.configured;
  const hostedServerConfigured = !!modelStatus.data?.server.hostedConfigured;
  const hostedServerLocked = hostedServerConfigured && !serverConfigured;
  const hostedAccessReason = modelStatus.data?.server.access?.reason;
  const hostedAccessMessage = hostedAccessReason === "auth_required"
    ? {
        title: "线上模型已配置，请先登录",
        description: "登录后还需要把微信公众号绑定到当前账户，才能使用部署环境中的线上模型。",
      }
    : hostedAccessReason === "wechat_status_stale"
      ? {
          title: "暂时无法确认公众号关注状态",
          description: "微信状态复核暂时失败，请稍后重新检查；也可以临时使用本浏览器自己的模型配置。",
        }
      : hostedAccessReason === "account_disabled"
        ? {
            title: "当前账户的线上资源权限已停用",
            description: "请联系管理员核对账户状态，或使用本浏览器自己的模型配置。",
          }
        : {
            title: "公众号尚未绑定到当前账户",
            description: "仅关注公众号不会自动关联当前网页登录账户。请前往账户页生成专属绑定二维码并扫码；使用公众号验证码登录则会自动完成绑定。",
          };
  const formHasUnsavedChanges = JSON.stringify(localModelConfig) !== JSON.stringify(savedLocalModelConfig);
  const effectiveStatus = savedLocalActive
    ? {
        tone: "emerald" as const,
        title: "本浏览器模型正在生效",
        description: "生成菜单会优先使用当前浏览器已保存的模型配置，不会使用服务器默认模型。",
        model: savedLocalModelConfig.model,
        provider: savedLocalModelConfig.provider,
      }
    : serverConfigured
      ? {
          tone: "emerald" as const,
          title: "服务器环境变量正在生效",
          description: "当前浏览器没有启用可用的本地模型配置，生成菜单会使用部署环境变量。",
          model: modelStatus.data?.server.model || "gpt-4o-mini",
          provider: modelStatus.data?.server.provider || "openai",
        }
      : hostedServerLocked
        ? {
            tone: "red" as const,
            title: hostedAccessMessage.title,
            description: hostedAccessMessage.description,
            model: "等待授权",
            provider: "openai" as ModelProvider,
          }
        : {
            tone: "red" as const,
            title: "当前没有可用模型配置",
            description: "部署环境变量里没有 OPENAI_API_KEY；如果要生成 AI 菜单，需要在本页配置并保存本浏览器模型，或在部署平台配置环境变量。",
            model: "未配置",
            provider: "openai" as ModelProvider,
          };

  return (
    <TooltipProvider>
        <main className="mx-auto max-w-[1600px] animate-fade-in-up px-4 py-8 sm:px-6 lg:px-8">
        <PageHeader
          eyebrow={<Badge>模型设置</Badge>}
          title="大模型配置"
          description="配置当前浏览器使用的模型连接，并查看生成菜单时实际生效的模型来源。配置只保存在本浏览器。"
        />

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px] 2xl:grid-cols-[minmax(0,1fr)_480px]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BrainCircuit className="h-5 w-5 text-primary" />
                本浏览器模型配置
              </CardTitle>
              <CardDescription>
                这里的配置只保存在当前浏览器的 localStorage，不会写入服务器或 Supabase。谁在自己的浏览器配置，谁使用；同一个线上地址的其他用户不会读取到你的配置。
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <SwitchField
                title="启用本浏览器模型配置"
                description="关闭时使用服务器环境变量中的默认模型配置"
                help="适合线上页面让每个用户自己填模型配置。配置只保存在当前浏览器，不会被其他访问者共享。"
                checked={localModelConfig.enabled}
                onCheckedChange={(enabled) => setLocalModelConfig((config) => ({ ...config, enabled }))}
              />

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="服务类型" help="OpenAI 兼容接口适合阿里云百炼、DashScope compatible-mode 等服务。">
                  <SelectNative
                    value={localModelConfig.provider}
                    onChange={(e) => setLocalModelConfig((config) => ({ ...config, provider: e.target.value as ModelProvider }))}
                  >
                    <option value="openai">OpenAI</option>
                    <option value="openai_compatible">OpenAI 兼容接口</option>
                  </SelectNative>
                </Field>
                <Field label="模型名" help="填写服务商提供的模型 ID，例如 deepseek-v4-flash 或 gpt-4o-mini。">
                  <Input
                    value={localModelConfig.model}
                    onChange={(e) => setLocalModelConfig((config) => ({ ...config, model: e.target.value }))}
                    placeholder="例如：gpt-4o-mini"
                  />
                </Field>
                <Field label="API Key" help="只保存在当前浏览器 localStorage。线上其他用户不会读取到你的 Key。">
                  <div className="relative">
                    <Input
                      type={showApiKey ? "text" : "password"}
                      value={localModelConfig.api_key || ""}
                      onChange={(e) => setLocalModelConfig((config) => ({ ...config, api_key: e.target.value }))}
                      placeholder="只保存在当前浏览器"
                      className="pr-11"
                    />
                    <button
                      type="button"
                      aria-label={showApiKey ? "隐藏 API Key" : "显示 API Key"}
                      onClick={() => setShowApiKey((value) => !value)}
                      className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </Field>
                <Field label="Base URL" help="OpenAI 官方接口可留空；兼容接口填写服务商提供的 /v1 地址。">
                  <Input
                    value={localModelConfig.base_url || ""}
                    onChange={(e) => setLocalModelConfig((config) => ({ ...config, base_url: e.target.value }))}
                    placeholder="OpenAI 可留空，兼容接口填写服务地址"
                  />
                </Field>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="secondary" onClick={() => testModel.mutate()} disabled={testModel.isPending}>
                  {testModel.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
                  {testModel.isPending ? "测试中" : "测试连接"}
                </Button>
                <Button type="button" onClick={handleSaveLocalModel}>
                  <Save className="h-4 w-4" />
                  保存到本浏览器
                </Button>
                <Button type="button" variant="outline" onClick={handleClearLocalModel}>
                  <Trash2 className="h-4 w-4" />
                  清除本地配置
                </Button>
                {localModelSaved && <span className="text-sm text-primary">已保存到当前浏览器。</span>}
              </div>

              {modelTestResult && (
                <div
                  className={cn(
                    "flex items-start gap-2 rounded-lg border px-3 py-3 text-sm",
                    modelTestResult.ok ? "border-primary/30 bg-primary/10 text-primary" : "border-destructive/30 bg-destructive/10 text-destructive"
                  )}
                >
                  {modelTestResult.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
                  <div>
                    <p className="font-medium">{modelTestResult.ok ? "模型连接测试成功" : "模型连接测试失败"}</p>
                    <p className="mt-0.5">
                      {modelTestResult.ok
                        ? `${modelTestResult.model || "当前模型"} 响应正常${typeof modelTestResult.latencyMs === "number" ? `，耗时 ${modelTestResult.latencyMs}ms` : ""}。`
                        : modelTestResult.error || "请检查 API Key、Base URL 和模型名。"}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ServerCog className="h-5 w-5 text-primary" />
                当前生效模型
              </CardTitle>
              <CardDescription>这里显示生成菜单时实际会优先使用哪里的模型配置。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div
                className={cn(
                  "rounded-lg border p-3",
                  effectiveStatus.tone === "emerald" ? "border-primary/30 bg-primary/10 text-primary" : "border-destructive/30 bg-destructive/10 text-destructive"
                )}
              >
                <div className="flex items-start gap-2">
                  {effectiveStatus.tone === "emerald" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{effectiveStatus.title}</p>
                    <p className="mt-1 text-xs leading-5">{effectiveStatus.description}</p>
                    {hostedServerLocked && !savedLocalActive && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="border-destructive/30 bg-card text-destructive hover:bg-destructive/10"
                          onClick={() => void modelStatus.refetch()}
                          disabled={modelStatus.isFetching}
                        >
                          {modelStatus.isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                          重新检查授权
                        </Button>
                        <Button asChild size="sm" variant="outline" className="border-destructive/30 bg-card text-destructive hover:bg-destructive/10">
                          <Link href="/account">前往账户绑定</Link>
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {formHasUnsavedChanges && (
                <div className="rounded-lg border border-warning/30 bg-warning/10 text-warning">
                  <p className="font-medium">当前表单有未保存修改</p>
                  <p className="mt-1 text-xs leading-5">生成菜单仍会使用上一次保存到浏览器的配置。点击“保存到本浏览器”后才会生效。</p>
                </div>
              )}

              <div className="rounded-lg bg-muted p-3 text-muted-foreground">
                <p className="font-medium text-foreground">当前生效模型</p>
                <p className="mt-1">{effectiveStatus.model}</p>
                <p className="mt-1 text-xs">服务类型：{effectiveStatus.provider === "openai_compatible" ? "OpenAI 兼容接口" : "OpenAI"}</p>
              </div>

              <div className="rounded-lg bg-muted p-3 text-muted-foreground">
                <p className="font-medium text-foreground">服务器环境变量</p>
                {modelStatus.isPending ? (
                  <p className="mt-1">读取中...</p>
                ) : serverConfigured ? (
                  <p className="mt-1">
                    已配置 <code className="rounded bg-card px-1 py-0.5 text-xs text-foreground">OPENAI_API_KEY</code>，默认模型为 {modelStatus.data?.server.model}
                    {modelStatus.data?.server.baseUrlConfigured ? "，已配置兼容接口 Base URL。" : "。"}
                  </p>
                ) : hostedServerLocked ? (
                  <p className="mt-1">{hostedAccessMessage.description}</p>
                ) : (
                  <p className="mt-1">
                    未检测到 <code className="rounded bg-card px-1 py-0.5 text-xs text-foreground">OPENAI_API_KEY</code>。你可以在本页配置并保存本浏览器模型，或在部署平台配置环境变量。
                  </p>
                )}
              </div>

              <div className="rounded-lg bg-muted p-3 text-muted-foreground">
                <p className="font-medium text-foreground">本浏览器配置</p>
                <p className="mt-1">
                  {savedLocalModelConfig.enabled
                    ? savedLocalHasKey
                      ? `已启用，模型为 ${savedLocalModelConfig.model}。`
                      : "已启用，但还没有保存 API Key。"
                    : "未启用。"}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </TooltipProvider>
  );
}
