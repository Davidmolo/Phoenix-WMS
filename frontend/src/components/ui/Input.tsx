import { cn } from "@/lib/cn";
import type { InputHTMLAttributes, ReactNode } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  icon?: ReactNode;
};

export function Input({ className, icon, ...props }: Props) {
  if (icon) {
    return (
      <div className="relative">
        <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint">
          {icon}
        </span>
        <input
          className={cn(
            "w-full rounded-[var(--radius)] border border-border bg-white py-2.5 pr-3 pl-10 text-sm text-text outline-none transition-all placeholder:text-faint",
            "hover:border-border-strong focus:border-accent focus:ring-2 focus:ring-accent-bg",
            "disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-muted",
            "read-only:bg-surface-2 read-only:text-navy",
            className
          )}
          {...props}
        />
      </div>
    );
  }

  return (
    <input
      className={cn(
        "w-full rounded-[var(--radius)] border border-border bg-white px-3 py-2.5 text-sm text-text outline-none transition-all placeholder:text-faint",
        "hover:border-border-strong focus:border-accent focus:ring-2 focus:ring-accent-bg",
        "disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-muted",
        "read-only:bg-surface-2 read-only:text-navy",
        className
      )}
      {...props}
    />
  );
}
