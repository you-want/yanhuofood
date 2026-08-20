import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8" aria-label="页面加载中">
      <div className="space-y-3">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-9 w-64 max-w-full" />
        <Skeleton className="h-5 w-[32rem] max-w-full" />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4 rounded-lg border border-border bg-card p-5">
          <Skeleton className="h-7 w-48" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-20" />
            ))}
          </div>
          <Skeleton className="h-72" />
        </div>
        <div className="space-y-4 rounded-lg border border-border bg-card p-5">
          <Skeleton className="h-6 w-32" />
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-12" />
          ))}
        </div>
      </div>
    </main>
  );
}
