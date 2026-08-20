import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  eyebrow?: ReactNode;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ eyebrow, title, description, actions, className }: PageHeaderProps) {
  return (
    <header className={cn("mb-7 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow ? (
          <div className="flex flex-wrap items-center gap-2">
            {typeof eyebrow === "string" ? <Badge>{eyebrow}</Badge> : eyebrow}
          </div>
        ) : null}
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{title}</h1>
        {description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-[15px]">{description}</p> : null}
      </div>
      {actions ? <div className="flex w-full shrink-0 flex-wrap gap-2 lg:w-auto lg:justify-end">{actions}</div> : null}
    </header>
  );
}
