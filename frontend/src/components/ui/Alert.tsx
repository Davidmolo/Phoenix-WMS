import { cn } from "@/lib/cn";
import { AlertCircle, CheckCircle2, Info } from "lucide-react";

export function Alert({
  children,
  tone = "danger",
  className,
}: {
  children?: React.ReactNode;
  tone?: "danger" | "info" | "success";
  className?: string;
}) {
  if (!children) return null;

  const tones = {
    danger: "border-danger/20 bg-danger-bg text-danger",
    info: "border-[rgba(230,160,48,0.3)] bg-accent-bg text-[var(--accent-text)]",
    success: "border-[rgba(15,122,69,0.2)] bg-success-bg text-[var(--success)]",
  };

  const Icon = tone === "success" ? CheckCircle2 : tone === "info" ? Info : AlertCircle;

  return (
    <div
      role="alert"
      className={cn(
        "mb-4 flex items-start gap-2.5 rounded-[var(--radius)] border px-3.5 py-3 text-[13.5px] leading-relaxed",
        tones[tone],
        className
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
