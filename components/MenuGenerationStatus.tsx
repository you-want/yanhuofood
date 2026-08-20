"use client";

import { ChefHat, Clock, PauseCircle, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

const QUIPS = [
  "正在劝香菜认真尊重你的忌口。",
  "采购清单正在努力不让你买三次葱。",
  "正在给番茄和鸡蛋安排一次正式会面。",
  "营养数字在算账，锅暂时不用背锅。",
  "冰箱复用计划正在形成，剩菜没有发言权。",
  "正在检查本周菜单有没有换个名字又来一次。",
];

const STAGE_LABELS: Record<string, string> = {
  queued: "生成任务已创建",
  planning: "正在规划整周菜名",
  generating_days: "正在逐天补充食材和做法",
  finalizing: "正在检查并保存菜单",
};

interface MenuGenerationStatusProps {
  stage?: string;
  completedDays: number;
  totalDays: number;
  currentDay?: number | null;
  startedAt?: string;
  jobId?: string;
  onCancel?: () => void;
}

function formatElapsed(seconds: number) {
  if (seconds < 60) return `${seconds} 秒`;
  return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}

export default function MenuGenerationStatus({
  stage = "queued",
  completedDays,
  totalDays,
  currentDay,
  startedAt,
  jobId,
  onCancel,
}: MenuGenerationStatusProps) {
  const [quipIndex, setQuipIndex] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setQuipIndex((index) => (index + 1) % QUIPS.length), 7000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setPhase((p) => (p + 1) % 3), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const elapsedSeconds = useMemo(() => {
    const start = startedAt ? new Date(startedAt).getTime() : now;
    return Math.max(0, Math.floor((now - start) / 1000));
  }, [now, startedAt]);

  const progress = totalDays > 0 ? Math.round((completedDays / totalDays) * 100) : 0;

  const detail = stage === "generating_days" && typeof currentDay === "number"
    ? `第 ${Math.min(currentDay + 1, totalDays)} 天正在整理，已完成 ${completedDays}/${totalDays} 天。`
    : stage === "finalizing"
      ? `已完成 ${completedDays}/${totalDays} 天，正在做最后检查。`
      : "先确定整周搭配，再从第一天开始补充详情。";

  return (
    <div className="mb-4 border border-primary/20 bg-gradient-to-r from-primary/10 to-primary/20 px-4 py-4 text-sm text-primary" aria-live="polite">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-1 items-start gap-4">
          <div className="relative">
            <div className="absolute inset-0 animate-ping rounded-full bg-primary opacity-30" />
            <ChefHat className="relative h-8 w-8 shrink-0 animate-spin text-primary" style={{ animationDuration: "2s" }} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <div className="flex items-center gap-2">
                <span className={cn(
                  "h-2 w-2 rounded-full",
                  phase === 0 && "bg-warning",
                  phase === 1 && "bg-primary",
                  phase === 2 && "bg-primary",
                )} />
                <p className="font-medium">{STAGE_LABELS[stage] || "正在生成菜单"}</p>
              </div>
              <span className="flex items-center gap-1 text-xs text-primary">
                <Clock className="h-3 w-3" />
                已等待 {formatElapsed(elapsedSeconds)}
              </span>
            </div>
            <p className="mt-2 text-primary">{detail}</p>

            {totalDays > 0 && (
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs text-primary">
                  <span>进度</span>
                  <span>{completedDays}/{totalDays} 天 ({progress}%)</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-primary/20">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-primary to-primary transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  >
                    <div className="h-full w-full animate-pulse bg-gradient-to-r from-transparent via-white/30 to-transparent" />
                  </div>
                </div>
                <div className="mt-1.5 flex gap-1" aria-label={`已完成 ${completedDays} 天，共 ${totalDays} 天`}>
                  {Array.from({ length: totalDays }, (_, index) => (
                    <span
                      key={index}
                      className={cn(
                        "flex-1 h-1 rounded-full transition-all",
                        index < completedDays && "bg-primary",
                        index >= completedDays && "bg-primary/20",
                        index === currentDay && index >= completedDays && "animate-pulse bg-warning",
                      )}
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="mt-3 flex items-center gap-2 border-t border-primary/20 pt-2 text-xs text-primary">
              <span className="min-w-0 flex-1">{QUIPS[quipIndex]}</span>
              <button
                type="button"
                onClick={() => setQuipIndex((index) => (index + 1) % QUIPS.length)}
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                title="换一句"
                aria-label="换一句等待文案"
              >
                <RefreshCw className="h-3 w-3" />
              </button>
            </div>
            {jobId && <p className="mt-1 text-xs text-primary">任务 {jobId.slice(0, 8)}，刷新页面后可恢复。</p>}
          </div>
        </div>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-destructive/30 bg-card px-3 py-2 text-xs font-medium text-destructive shadow-sm transition hover:border-destructive hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title="取消生成"
            aria-label="取消菜单生成"
          >
            <PauseCircle className="h-4 w-4" />
            取消
          </button>
        )}
      </div>
    </div>
  );
}
