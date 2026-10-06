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
      <div className="h-1.5 bg-[linear-gradient(90deg,var(--accent),var(--navy-soft))]" />
      <CardBody className="relative px-5 py-5 sm:px-6 sm:py-6">
        {icon ? (
          <div className="absolute top-5 right-5 flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--blend-soft)] text-accent sm:h-12 sm:w-12">
            {icon}
          </div>
        ) : null}
        <div className="text-[12px] font-bold tracking-[0.07em] text-muted uppercase">{label}</div>
        {loading ? (
          <Skeleton className="mt-3 h-10 w-20" />
        ) : (
          <div className="font-display mt-2.5 pr-12 text-[34px] leading-none font-semibold tracking-wide tabular-nums text-navy sm:text-[40px]">
            {value ?? "—"}
          </div>
        )}
        {hint && !loading ? <div className="mt-2.5 text-sm text-muted">{hint}</div> : null}
        {loading ? <Skeleton className="mt-2.5 h-3 w-32" /> : null}
      </CardBody>
    </Card>
  );
}

export function KpiGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 xl:grid-cols-[repeat(auto-fit,minmax(280px,1fr))]",
        className
      )}
      style={{ gridAutoRows: "1fr" }}
    >
      {children}
    </div>
  );
}
