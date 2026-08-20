import { Skeleton } from "@/components/ui/skeleton";

interface PageLoadingProps {
  variant?: "workspace" | "cards" | "table";
}

export function PageLoading({ variant = "workspace" }: PageLoadingProps) {
  if (variant === "cards") {
    return (
      <main className="mx-auto max-w-[1600px] px-3 py-5 sm:px-6 sm:py-8 lg:px-8" aria-label="页面加载中">
        <div className="space-y-3">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-5 w-full max-w-xl" />
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="mt-4 h-4 w-full" />
              <Skeleton className="mt-2 h-4 w-4/5" />
              <Skeleton className="mt-6 h-24 w-full" />
            </div>
          ))}
        </div>
      </main>
    );
  }

  if (variant === "table") {
    return (
      <main className="mx-auto max-w-[1600px] px-3 py-5 sm:px-6 sm:py-8 lg:px-8" aria-label="页面加载中">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="mt-3 h-5 w-full max-w-2xl" />
        <div className="mt-6 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="grid grid-cols-4 gap-4 border-b border-border bg-muted px-4 py-3 sm:px-6">
            {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-4 w-20" />)}
          </div>
          <div className="space-y-4 p-4 sm:p-6">
            {Array.from({ length: 7 }).map((_, row) => (
              <div key={row} className="grid grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, column) => <Skeleton key={column} className="h-5 w-full" />)}
              </div>
            ))}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[1600px] px-3 py-5 sm:px-6 sm:py-8 lg:px-8" aria-label="页面加载中">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="mt-4 h-8 w-2/3" />
          <Skeleton className="mt-3 h-5 w-full" />
          <Skeleton className="mt-2 h-5 w-4/5" />
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-20" />)}
          </div>
        </section>
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="mt-3 h-4 w-2/3" />
          <div className="mt-6 space-y-3">
            {Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-16" />)}
          </div>
        </section>
      </div>
    </main>
  );
}
