import { cn } from "@/lib/cn";

type Tone = "neutral" | "accent" | "success" | "warning" | "danger";

const tones: Record<Tone, string> = {
  neutral: "bg-[var(--surface-2)] text-muted",
  accent: "bg-accent-bg text-[var(--accent-text)]",
  success: "bg-[var(--success-bg)] text-[var(--success)]",
  warning: "bg-[var(--warning-bg)] text-[var(--warning)]",
  danger: "bg-danger-bg text-danger",
};

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold capitalize",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

export function statusTone(status?: string): Tone {
  const s = (status || "").toLowerCase();
  if (["paid", "completed", "stored", "received", "approved"].includes(s)) return "success";
  if (["pending", "draft", "expected", "staged", "staged_for_store", "open", "in_progress"].includes(s))
    return "warning";
  if (["void", "cancelled", "past_due", "shipped"].includes(s)) return s === "shipped" ? "accent" : "danger";
  return "neutral";
}

/** Human labels for warehouse statuses (Cesar: Staged for Store). */
export function statusLabel(status?: string): string {
  if (!status) return "—";
  if (status === "staged_for_store") return "Staged for Store";
  if (status === "trailer_rework") return "Trailer Rework";
  if (status === "crossdock") return "Crossdock";
  if (status === "in_progress") return "In progress";
  return status.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
