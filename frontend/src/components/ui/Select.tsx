import { cn } from "@/lib/cn";
import type { SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";

type Props = SelectHTMLAttributes<HTMLSelectElement>;

export function Select({ className, children, ...props }: Props) {
  return (
    <div className="relative">
      <select
        className={cn(
          "w-full appearance-none rounded-[var(--radius)] border border-border bg-white py-2.5 pr-10 pl-3 text-sm text-text outline-none transition-all",
          "hover:border-border-strong focus:border-accent focus:ring-2 focus:ring-accent-bg",
          "disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-muted",
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-muted"
        aria-hidden
      />
    </div>
  );
}
