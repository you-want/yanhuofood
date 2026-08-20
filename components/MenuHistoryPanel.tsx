"use client";

import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getMenuEndDate, getMenuStartDate } from "@/lib/domain/menu";
import type { LocalMenuRecord } from "@/lib/local-menus";
import { cn } from "@/lib/utils";

interface MenuHistoryPanelProps {
  menus: LocalMenuRecord[];
  selectedStartDate: string | null;
  loading: boolean;
  error?: string | null;
  onSelect: (startDate: string) => void;
  onRetry: () => void;
}

function recordStartDate(menu: LocalMenuRecord) {
  return menu.start_date || getMenuStartDate(menu.data) || menu.week_start;
}

export default function MenuHistoryPanel({
  menus,
  selectedStartDate,
  loading,
  error,
  onSelect,
  onRetry,
}: MenuHistoryPanelProps) {
  return (
    <Card id="menu-history">
      <CardHeader>
        <CardTitle>历史菜单</CardTitle>
        <CardDescription>切换查看之前生成的菜单。</CardDescription>
      </CardHeader>
      <CardContent>
        {loading && menus.length === 0 ? (
          <div className="space-y-2" aria-label="历史菜单加载中">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-4/5" />
          </div>
        ) : error && menus.length === 0 ? (
          <div className="space-y-3 text-sm text-destructive" role="alert">
            <p>历史菜单加载失败：{error}</p>
            <Button size="sm" variant="outline" onClick={onRetry}>重新加载</Button>
          </div>
        ) : menus.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {menus.map((menu) => {
              const startDate = recordStartDate(menu);
              const selected = selectedStartDate === startDate;
              return (
                <button
                  key={startDate}
                  type="button"
                  onClick={() => onSelect(startDate)}
                  className={cn(
                    "inline-flex h-auto min-h-[2rem] items-center gap-1.5 rounded-md border px-3 py-1 text-sm transition whitespace-nowrap",
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-card text-foreground hover:border-primary/30"
                  )}
                >
                  {selected && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
                  <span>{getMenuStartDate(menu.data)} ~ {getMenuEndDate(menu.data)}</span>
                  {menu.source === "sample" && (
                    <span
                      aria-label="通用样例"
                      className={cn(
                        "shrink-0 rounded px-1 text-xs",
                        selected
                          ? "bg-white/20 text-white/90"
                          : "bg-warning/15 text-warning"
                      )}
                    >
                      样例
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">暂无历史菜单。</p>
        )}
      </CardContent>
    </Card>
  );
}
