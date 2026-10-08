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
        "mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between",
        className
      )}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        {icon ? (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--blend-soft)] text-accent">
            {icon}
          </div>
        ) : null}
        <div className="min-w-0 space-y-0.5">
          <h1 className="font-display m-0 text-[15px] font-semibold tracking-[0.03em] text-navy uppercase sm:text-base">
            {title}
          </h1>
          {description ? (
            <p className="m-0 max-w-3xl text-[12px] leading-snug text-muted sm:text-[12.5px]">
              {description}
            </p>
          ) : null}
          <div className="mt-1.5 h-0.5 w-10 rounded-full bg-[linear-gradient(90deg,var(--accent),transparent)]" />
        </div>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-1.5">{actions}</div> : null}
    </div>
  );
}
