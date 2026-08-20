"use client";

import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-xl items-center px-4 py-12 sm:px-6">
      <div className="w-full rounded-2xl border border-destructive/30 bg-card p-6 text-center shadow-sm sm:p-8">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="h-6 w-6" aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-xl font-semibold text-foreground">页面暂时出了点问题</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">可以先重试当前页面；如果问题持续，返回总览继续使用其他功能。</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button type="button" onClick={reset}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            重试当前页面
          </Button>
          <Button asChild variant="outline">
            <Link href="/">返回总览</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
