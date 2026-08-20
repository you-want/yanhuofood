import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-xl items-center px-4 py-12 sm:px-6">
      <div className="w-full rounded-2xl border border-border bg-card p-6 text-center shadow-sm sm:p-8">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
          <SearchX className="h-6 w-6" aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-xl font-semibold text-foreground">找不到这个页面</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">链接可能已经失效，返回总览后可以继续规划菜单。</p>
        <Button asChild className="mt-6">
          <Link href="/">返回总览</Link>
        </Button>
      </div>
    </main>
  );
}
