import { cn } from "@/lib/cn";
import type { SelectHTMLAttributes } from "react";

type Props = SelectHTMLAttributes<HTMLSelectElement>;

/** Styled native select — matches Input height, focus, and padding. */
export function Select({ className, children, ...props }: Props) {
  return (
    <div className="relative">
      <select
        className={cn(
          "w-full appearance-none rounded-lg border border-border bg-white py-2.5 pr-10 pl-3 text-sm text-text outline-none transition-shadow",
          "focus:border-accent focus:ring-2 focus:ring-accent-bg",
          "disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-muted",
          className
        )}
        {...props}
      >
        {children}
      </select>
      <span
        className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted"
        aria-hidden
      >
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
          <path
            d="M5 7.5L10 12.5L15 7.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </div>
  );
}
