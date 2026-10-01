"use client";

import { cn } from "@/lib/cn";

/** Paddock-style selectable chips used across admin + portal filters/forms. */
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
        <div className="mb-2 text-[11px] font-bold tracking-[0.07em] text-navy uppercase">
          {label}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {normalized.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={cn(
              "rounded-xl border text-left font-semibold capitalize transition duration-200 ease-out",
              "hover:-translate-y-0.5 hover:shadow-[var(--shadow)]",
              size === "sm" ? "min-h-8 px-3 py-1.5 text-xs" : "min-h-10 px-3.5 py-2.5 text-sm",
              value === opt.id
                ? "border-accent bg-accent-bg text-[var(--accent-text)] shadow-[var(--shadow-button)]"
                : "border-border bg-[var(--surface-2)] text-navy hover:border-accent/60"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
