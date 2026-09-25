import { cn } from "@/lib/cn";

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
    danger: "border-danger-bg bg-danger-bg text-danger",
    info: "border-[#d6e2ff] bg-accent-bg text-accent-dark",
    success: "border-success-bg bg-success-bg text-[var(--success)]",
  };

  return (
    <div
      role="alert"
      className={cn(
        "mb-4 rounded-lg border px-3.5 py-2.5 text-[13.5px] leading-relaxed",
        tones[tone],
        className
      )}
    >
      {children}
    </div>
  );
}
