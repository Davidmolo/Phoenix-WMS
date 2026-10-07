"use client";

import { cn } from "@/lib/cn";

/** Refined selectable chips for filters and booking forms. */
export function ChipGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  size = "md",
}: {
  label?: string;
  options: Array<{ id: T; label: string } | T>;
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "md";
}) {
  const normalized = options.map((o) =>
    typeof o === "string" ? { id: o as T, label: o } : o
  );
  return (
    <div>
      {label ? (
        <div className="mb-2 text-[11px] font-bold tracking-[0.08em] text-navy uppercase">
          {label}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {normalized.map((opt) => {
          const active = value === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id)}
              className={cn(
                "rounded-full border text-left font-semibold capitalize transition duration-200 ease-out",
                size === "sm" ? "min-h-8 px-3.5 py-1.5 text-xs" : "min-h-9 px-4 py-2 text-[13px]",
                active
                  ? "border-navy bg-navy text-white shadow-[0_6px_14px_-8px_rgba(30,46,62,0.55)]"
                  : "border-border bg-white text-navy hover:-translate-y-0.5 hover:border-navy/30 hover:bg-surface-2 hover:shadow-[var(--shadow)]"
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
