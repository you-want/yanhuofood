"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, BarChart3, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const EVENT_LABELS: Record<string, string> = {
  menu_page_viewed: "进入菜单页",
  generation_started: "开始生成",
  generation_completed: "生成成功",
  menu_saved: "调整/保存",
  shopping_list_viewed: "打开清单",
  shopping_item_updated: "执行动作",
};

export default function AnalyticsPage() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["product-events"],
    queryFn: async () => {
      const res = await fetch("/api/events");
      return res.json();
    },
  });

  const funnel = data?.funnel || [];
  const events = data?.events || [];
  const maxCount = Math.max(1, ...funnel.map((item: { count: number }) => item.count || 0));

  return (
    <main className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow={<Badge>阶段 0 基线</Badge>}
        title="匿名漏斗看板"
        description="仅展示当前浏览器匿名标识的产品事件，不包含 API Key、完整 Prompt、完整模型输出或自由输入内容。"
        actions={<Button variant="outline" onClick={() => void refetch()} disabled={isFetching}><RefreshCw className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />刷新数据</Button>}
      />

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card px-4 py-3"><p className="text-xs text-muted-foreground">漏斗步骤</p><p className="mt-1 text-xl font-semibold text-foreground">{funnel.length}</p></div>
        <div className="rounded-xl border border-border bg-card px-4 py-3"><p className="text-xs text-muted-foreground">累计事件</p><p className="mt-1 text-xl font-semibold text-foreground">{events.length}</p></div>
        <div className="rounded-xl border border-border bg-card px-4 py-3"><p className="text-xs text-muted-foreground">当前匿名会话</p><p className="mt-1 truncate text-sm font-medium text-foreground">{data?.clientId || "加载中"}</p></div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              核心漏斗
            </CardTitle>
            <CardDescription>client_id: {data?.clientId || "加载中"}</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">加载中...</p>
            ) : (
              <div className="space-y-4">
                {funnel.map((item: { event: string; count: number }) => (
                  <div key={item.event}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium text-foreground">{EVENT_LABELS[item.event] || item.event}</span>
                      <span className="text-muted-foreground">{item.count}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${Math.max(3, Math.round(((item.count || 0) / maxCount) * 100))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              最近事件
            </CardTitle>
            <CardDescription>按发生时间倒序展示最近 500 条白名单事件。</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">加载中...</p>
            ) : events.length === 0 ? (
              <p className="rounded-lg border border-dashed border-input bg-muted px-4 py-8 text-center text-sm text-muted-foreground">暂无事件。</p>
            ) : (
              <div className="max-h-[560px] overflow-auto rounded-lg border border-border">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">时间</th>
                      <th className="px-3 py-2 font-medium">事件</th>
                      <th className="px-3 py-2 font-medium">属性</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((event: { event_name: string; properties: Record<string, unknown>; created_at: string }, index: number) => (
                      <tr key={`${event.created_at}-${event.event_name}-${index}`} className="border-t border-border">
                        <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{new Date(event.created_at).toLocaleString()}</td>
                        <td className="whitespace-nowrap px-3 py-2 font-medium text-foreground">{event.event_name}</td>
                        <td className="px-3 py-2 text-muted-foreground">{JSON.stringify(event.properties || {})}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
