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
        "mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between",
        className
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {icon ? (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--blend-soft)] text-accent shadow-[var(--shadow)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)]">
            {icon}
          </div>
        ) : null}
        <div className="min-w-0 space-y-1">
          <h1 className="font-display m-0 text-lg font-semibold tracking-[0.03em] text-navy uppercase sm:text-xl lg:text-[22px]">
            {title}
          </h1>
          {description ? (
            <p className="m-0 max-w-3xl text-[13px] leading-relaxed text-muted sm:text-[13.5px]">
              {description}
            </p>
          ) : null}
          <div className="mt-2 h-0.5 w-12 rounded-full bg-[linear-gradient(90deg,var(--accent),transparent)]" />
        </div>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
