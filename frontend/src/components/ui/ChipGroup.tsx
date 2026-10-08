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
      <div className="flex flex-wrap items-center gap-1.5">
        {normalized.map((opt) => {
          const active = value === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id)}
              className={cn(
                "inline-flex shrink-0 items-center whitespace-nowrap rounded-full border text-left font-semibold transition duration-200 ease-out",
                size === "sm" ? "h-7 px-2.5 text-[11px]" : "h-8 px-3.5 text-xs",
                active
                  ? "border-navy bg-navy text-white shadow-[0_6px_14px_-8px_rgba(30,46,62,0.55)]"
                  : "border-border bg-white text-navy hover:border-navy/30 hover:bg-surface-2"
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
