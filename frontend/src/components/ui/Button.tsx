import { cn } from "@/lib/cn";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Loader2 } from "lucide-react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const variants: Record<Variant, string> = {
  primary:
    "bg-[linear-gradient(135deg,#E6A030,#DA8E0B)] text-[var(--navy-deep)] border-transparent shadow-[var(--shadow-button)] hover:brightness-[1.03] font-bold",
  secondary:
    "bg-white text-navy border-border hover:bg-surface-2 hover:border-border-strong font-semibold",
  ghost:
    "bg-transparent text-muted border-transparent hover:bg-accent-bg hover:text-[var(--accent-text)] font-semibold",
  danger: "bg-danger-bg text-danger border-transparent hover:opacity-90 font-semibold",
};

const sizes: Record<Size, string> = {
  sm: "px-2.5 py-1.5 text-xs rounded-[8px]",
  md: "px-4 py-2.5 text-sm rounded-[var(--radius)]",
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  loading,
  disabled,
  children,
  icon,
  ...props
}: Props) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 border transition-all disabled:cursor-not-allowed disabled:opacity-60",
        variants[variant],
        sizes[size],
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {loading ? "Please wait…" : children}
    </button>
  );
}
