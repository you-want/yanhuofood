"use client";

import { AlertTriangle, CheckCircle2, RotateCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface MenuResultNoticeProps {
  source?: "local" | "ai" | "sample" | "cache";
  constraintIssueCount?: number;
  listError?: string | null;
  listWarning?: string | null;
  storageWarnings?: string[];
  onRetryGeneration?: () => void;
  onRetryList?: () => void;
  generationBusy?: boolean;
}

export default function MenuResultNotice({
  source,
  constraintIssueCount = 0,
  listError,
  listWarning,
  storageWarnings = [],
  onRetryGeneration,
  onRetryList,
  generationBusy = false,
}: MenuResultNoticeProps) {
  const isSample = source === "sample";
  const hasConstraintIssues = constraintIssueCount > 0;
  if (!isSample && !hasConstraintIssues && !listError && !listWarning && storageWarnings.length === 0) return null;

  const critical = isSample || hasConstraintIssues;
  const hasStorageWarnings = !!listWarning || storageWarnings.length > 0;
  return (
    <Card className={cn(critical || hasStorageWarnings ? "border-warning/40 bg-warning/10" : "border-destructive/30 bg-destructive/10")}>
      <CardContent className="flex flex-col gap-3 pt-5 text-sm sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          {critical || hasStorageWarnings
            ? <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            : <WifiOff className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />}
          <div className="space-y-1">
            {isSample && (
              <>
                <p className="font-semibold text-warning">当前是通用样例菜单，不是完整的个性化 AI 结果</p>
                <p className="text-warning">样例可能没有完整遵循你的忌口、清真、人数和健康目标。确认或重新生成前，不建议用于采购。</p>
              </>
            )}
            {hasConstraintIssues && (
              <p className="font-medium text-warning">发现 {constraintIssueCount} 处硬约束冲突。修正前已限制保存到食谱库等执行操作。</p>
            )}
            {listError && (
              <>
                <p className="font-semibold text-destructive">历史菜单加载失败</p>
                <p className="text-destructive">{listError}。本浏览器已保存的菜单仍可继续使用。</p>
              </>
            )}
            {listWarning && !listError && (
              <>
                <p className="font-semibold text-warning">当前使用本浏览器菜单</p>
                <p className="text-warning">{listWarning} Supabase 恢复后可重新加载服务端历史。</p>
              </>
            )}
            {storageWarnings.length > 0 && (
              <div className="space-y-1 text-warning">
                {storageWarnings.map((warning) => <p key={warning}>{warning}</p>)}
              </div>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {(isSample || hasConstraintIssues) && onRetryGeneration && (
            <Button size="sm" onClick={onRetryGeneration} disabled={generationBusy}>
              <RotateCw className={cn("h-4 w-4", generationBusy && "animate-spin")} />
              重新生成 AI 菜单
            </Button>
          )}
          {(listError || listWarning) && onRetryList && (
            <Button size="sm" variant="outline" onClick={onRetryList}>
              <CheckCircle2 className="h-4 w-4" />
              重新加载历史菜单
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
