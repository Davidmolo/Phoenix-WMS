import { Card, CardBody } from "./Card";
import { Skeleton } from "./Skeleton";
import type { KeyboardEvent, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function KpiCard({
  label,
  value,
  hint,
  icon,
  loading,
  onClick,
}: {
  label: string;
  value?: string | number | null;
  hint?: string;
  icon?: ReactNode;
  loading?: boolean;
  /** When set, the whole card becomes a clickable / keyboard-focusable target. */
  onClick?: () => void;
}) {
  const clickable = Boolean(onClick) && !loading;
  return (
    <Card
      className={cn("overflow-hidden", clickable && "cursor-pointer hover:-translate-y-0.5")}
      style={{ background: "var(--blend-kpi)" }}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? onClick : undefined}
      onKeyDown={
        clickable
          ? (e: KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
    >
      <div className="h-1 bg-[linear-gradient(90deg,var(--accent),var(--navy-soft))]" />
      <CardBody className="px-3.5 py-3 sm:px-4 sm:py-3.5">
        <div className="flex items-start gap-2.5">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold tracking-[0.06em] text-muted uppercase leading-snug">
              {label}
            </div>
            {loading ? (
              <Skeleton className="mt-2 h-7 w-16" />
            ) : (
              <div className="font-display mt-1.5 text-[22px] leading-tight font-semibold tracking-wide tabular-nums text-navy break-words sm:text-[26px]">
                {value ?? "—"}
              </div>
            )}
            {hint && !loading ? (
              <div className="mt-1.5 text-xs leading-snug text-muted">{hint}</div>
            ) : null}
            {loading ? <Skeleton className="mt-1.5 h-3 w-28" /> : null}
          </div>
          {icon ? (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--blend-soft)] text-accent">
              {icon}
            </div>
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}

export function KpiGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 xl:grid-cols-[repeat(auto-fit,minmax(160px,1fr))]",
        className
      )}
      style={{ gridAutoRows: "1fr" }}
    >
      {children}
    </div>
  );
}
