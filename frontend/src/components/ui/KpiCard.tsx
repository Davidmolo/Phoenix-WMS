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
      <CardBody className="relative">
        {icon ? (
          <div className="absolute top-4 right-4 flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--blend-soft)] text-accent">
            {icon}
          </div>
        ) : null}
        <div className="text-[11px] font-bold tracking-[0.06em] text-muted uppercase">{label}</div>
        {loading ? (
          <Skeleton className="mt-2.5 h-8 w-16" />
        ) : (
          <div className="font-display mt-1.5 pr-10 text-[28px] leading-none font-semibold tracking-wide tabular-nums text-navy">
            {value ?? "—"}
          </div>
        )}
        {hint && !loading ? <div className="mt-1.5 text-xs text-muted">{hint}</div> : null}
        {loading ? <Skeleton className="mt-2 h-2.5 w-28" /> : null}
      </CardBody>
    </Card>
  );
}

export function KpiGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3 2xl:grid-cols-4",
        className
      )}
    >
      {children}
    </div>
  );
}
