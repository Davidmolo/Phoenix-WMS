import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
  className,
  icon,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
  icon?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
        className
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        {icon ? (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--blend-soft)] text-accent">
            {icon}
          </div>
        ) : null}
        <div className="min-w-0 flex-1 space-y-0.5">
          <h1 className="font-display m-0 truncate text-[15px] font-semibold tracking-[0.03em] text-navy uppercase sm:text-base">
            {title}
          </h1>
          {description ? (
            <p className="m-0 line-clamp-2 text-[12px] leading-snug text-muted sm:text-[12.5px]">
              {description}
            </p>
          ) : null}
          <div className="mt-1.5 h-0.5 w-10 rounded-full bg-[linear-gradient(90deg,var(--accent),transparent)]" />
        </div>
      </div>
      {actions ? (
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end [&>div]:flex [&>div]:flex-wrap [&>div]:items-center [&>div]:gap-2">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
