import { Card, CardBody } from "./Card";
import { Skeleton } from "./Skeleton";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function KpiCard({
  label,
  value,
  hint,
  icon,
  loading,
}: {
  label: string;
  value?: string | number | null;
  hint?: string;
  icon?: ReactNode;
  loading?: boolean;
}) {
  return (
    <Card className="overflow-hidden" style={{ background: "var(--blend-kpi)" }}>
      <div className="h-1 bg-[linear-gradient(90deg,var(--accent),var(--navy-soft))]" />
      <CardBody className="relative px-3.5 py-3 sm:px-4 sm:py-3.5">
        {icon ? (
          <div className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--blend-soft)] text-accent">
            {icon}
          </div>
        ) : null}
        <div className="truncate text-[10px] font-bold tracking-[0.06em] whitespace-nowrap text-muted uppercase">
          {label}
        </div>
        {loading ? (
          <Skeleton className="mt-2 h-7 w-16" />
        ) : (
          <div className="font-display mt-1.5 pr-10 text-[22px] leading-none font-semibold tracking-wide tabular-nums text-navy sm:text-[26px]">
            {value ?? "—"}
          </div>
        )}
        {hint && !loading ? <div className="mt-1.5 text-xs text-muted">{hint}</div> : null}
        {loading ? <Skeleton className="mt-1.5 h-3 w-28" /> : null}
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
