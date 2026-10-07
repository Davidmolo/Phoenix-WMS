import { cn } from "@/lib/cn";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} aria-hidden />;
}

export function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2.5", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn("h-3", i === lines - 1 ? "w-2/3" : "w-full")}
        />
      ))}
    </div>
  );
}

/** Mirrors KpiCard: gold top bar + label + value */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[var(--radius-lg)] border border-border shadow-[var(--shadow)]",
        className
      )}
      style={{ background: "var(--blend-kpi)" }}
    >
      <div className="h-1.5 bg-[linear-gradient(90deg,var(--accent),var(--navy-soft))]" />
      <div className="relative px-5 py-5 sm:px-6 sm:py-6">
        <Skeleton className="absolute top-5 right-5 h-11 w-11 rounded-2xl sm:h-12 sm:w-12" />
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-3 h-10 w-20" />
        <Skeleton className="mt-2.5 h-3 w-32" />
      </div>
    </div>
  );
}

/** Mirrors PageHeader with icon */
export function SkeletonHeader({ className }: { className?: string }) {
  return (
    <div className={cn("mb-6 flex items-start gap-3", className)}>
      <Skeleton className="h-11 w-11 shrink-0 rounded-2xl" />
      <div className="min-w-0 flex-1 space-y-2 pt-1">
        <Skeleton className="h-6 w-40 max-w-[60%]" />
        <Skeleton className="h-3.5 w-64 max-w-full" />
      </div>
    </div>
  );
}

/** Mirrors DataTable card */
export function SkeletonTable({
  rows = 5,
  cols = 4,
  headers,
}: {
  rows?: number;
  cols?: number;
  headers?: string[];
}) {
  const colCount = headers?.length || cols;
  return (
    <div
      className="overflow-hidden rounded-[var(--radius-lg)] border border-border shadow-[var(--shadow)]"
      style={{ background: "var(--blend-card)" }}
    >
      <div className="overflow-x-auto">
        <div
          className="min-w-[480px] border-b border-border bg-[linear-gradient(90deg,#eef2f6,#f7f3eb)] px-3.5 py-3"
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))`,
            gap: "0.75rem",
          }}
        >
          {Array.from({ length: colCount }).map((_, i) => (
            <Skeleton key={i} className="h-2.5 w-16 max-w-full" />
          ))}
        </div>
        <div className="min-w-[480px] divide-y divide-border">
          {Array.from({ length: rows }).map((_, r) => (
            <div
              key={r}
              className="px-3.5 py-3.5"
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))`,
                gap: "0.75rem",
                alignItems: "center",
              }}
            >
              {Array.from({ length: colCount }).map((_, c) => (
                <Skeleton
                  key={c}
                  className={cn("h-3.5", c === 0 ? "w-20" : c === 1 ? "w-16 rounded-md" : "w-12")}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Mirrors FormSection */
export function SkeletonForm({
  fields = 4,
  className,
}: {
  fields?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[var(--radius-lg)] border border-border shadow-[var(--shadow)]",
        className
      )}
      style={{ background: "var(--blend-card)" }}
    >
      <div className="flex items-start gap-3 border-b border-border px-4 py-4 sm:px-5">
        <Skeleton className="h-9 w-9 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1 space-y-2 pt-1">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-48 max-w-full" />
        </div>
      </div>
      <div className="space-y-4 px-4 py-5 sm:px-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Array.from({ length: fields }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="h-10 w-full rounded-[var(--radius)]" />
            </div>
          ))}
        </div>
        <Skeleton className="h-10 w-36 rounded-[var(--radius)]" />
      </div>
    </div>
  );
}

/** Dashboard-shaped content skeleton */
export function SkeletonPage({
  variant = "dashboard",
}: {
  variant?: "dashboard" | "table" | "form" | "split";
}) {
  if (variant === "table") {
    return (
      <div className="space-y-6">
        <SkeletonHeader />
        <SkeletonTable rows={8} cols={5} />
      </div>
    );
  }

  if (variant === "form") {
    return (
      <div className="space-y-6">
        <SkeletonHeader />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-[var(--radius)] border border-border px-3 py-2.5"
              style={{ background: "var(--blend-kpi)" }}
            >
              <Skeleton className="h-2 w-14" />
              <Skeleton className="mt-2 h-4 w-20" />
            </div>
          ))}
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <SkeletonForm fields={4} />
          <SkeletonForm fields={2} />
        </div>
        <SkeletonTable rows={4} cols={4} />
      </div>
    );
  }

  if (variant === "split") {
    return (
      <div className="space-y-6">
        <SkeletonHeader />
        <div className="grid gap-5 lg:grid-cols-2">
          <SkeletonForm fields={4} />
          <SkeletonTable rows={6} cols={3} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SkeletonHeader />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 xl:grid-cols-[repeat(auto-fit,minmax(280px,1fr))]">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
      <div>
        <Skeleton className="mb-4 h-5 w-40" />
        <SkeletonTable rows={5} cols={4} />
      </div>
    </div>
  );
}

/** Full app chrome skeleton — same layout as AppShell */
export function SkeletonShell({
  variant = "dashboard",
}: {
  variant?: "dashboard" | "table" | "form" | "split";
}) {
  return (
    <div className="flex min-h-screen bg-bg">
      {/* Desktop sidebar mirror */}
      <aside
        className="sidebar-shell sticky top-0 hidden h-dvh w-[var(--sidebar-width)] shrink-0 flex-col lg:flex"
        style={{ background: "var(--sidebar)" }}
        aria-hidden
      >
        <div className="flex items-center gap-3 border-b border-[rgba(255,255,255,0.14)] px-4 py-5">
          <div
            className="skeleton h-11 w-11 shrink-0 rounded-xl"
            style={{ background: "rgba(255,255,255,0.18)", animation: "none" }}
          />
          <div className="min-w-0 flex-1 space-y-2">
            <div
              className="skeleton h-3.5 w-28"
              style={{ background: "rgba(255,255,255,0.22)", animation: "none" }}
            />
            <div
              className="skeleton h-2.5 w-10"
              style={{ background: "rgba(255,255,255,0.14)", animation: "none" }}
            />
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3 py-3">
          {Array.from({ length: 11 }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5",
                i === 0 && "bg-[rgba(230,160,48,0.18)]"
              )}
            >
              <div
                className="skeleton h-[18px] w-[18px] shrink-0 rounded-md"
                style={{ background: "rgba(255,255,255,0.28)", animation: "none" }}
              />
              <div
                className="skeleton h-3 rounded-md"
                style={{
                  width: i % 3 === 0 ? 96 : i % 3 === 1 ? 80 : 112,
                  background: "rgba(255,255,255,0.22)",
                  animation: "none",
                }}
              />
            </div>
          ))}
        </nav>
        <div className="mt-auto space-y-3 border-t border-[rgba(255,255,255,0.14)] p-4">
          <div
            className="skeleton h-3.5 w-28"
            style={{ background: "rgba(255,255,255,0.22)", animation: "none" }}
          />
          <div
            className="skeleton h-2.5 w-14"
            style={{ background: "rgba(255,255,255,0.14)", animation: "none" }}
          />
          <div
            className="skeleton h-10 w-full rounded-xl"
            style={{ background: "rgba(255,255,255,0.16)", animation: "none" }}
          />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar mirror */}
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-white/90 px-4 py-3 lg:hidden">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="ml-auto h-8 w-16 rounded-lg" />
        </header>

        <main className="mx-auto w-full max-w-[1680px] flex-1 px-3 py-4 sm:px-5 sm:py-6 lg:px-8 lg:py-7 xl:px-10">
          <SkeletonPage variant={variant} />
        </main>
      </div>
    </div>
  );
}
