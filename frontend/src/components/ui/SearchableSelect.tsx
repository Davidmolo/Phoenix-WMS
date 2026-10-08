"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/cn";

export type SearchableOption = {
  value: string;
  label: string;
  /** Extra text matched by search (e.g. email). */
  keywords?: string;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: SearchableOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
  /** Shown when value is "" (e.g. All customers). */
  allowEmpty?: boolean;
  emptyOptionLabel?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  className?: string;
};

function matchesQuery(opt: SearchableOption, q: string) {
  if (!q) return true;
  const hay = `${opt.label} ${opt.keywords || ""} ${opt.value}`.toLowerCase();
  return hay.includes(q);
}

/** Dropdown with type-to-search — use for long lists (customers, expected loads, etc.). */
export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyLabel = "No matches",
  allowEmpty = false,
  emptyOptionLabel = "None",
  disabled = false,
  required = false,
  id,
  className,
}: Props) {
  const autoId = useId();
  const fieldId = id || autoId;
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = useMemo(
    () => options.find((o) => o.value === value) || null,
    [options, value]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return options.filter((o) => matchesQuery(o, q));
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    const t = window.setTimeout(() => searchRef.current?.focus(), 0);
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(next: string) {
    onChange(next);
    setOpen(false);
    setQuery("");
  }

  const display =
    value === "" && allowEmpty
      ? emptyOptionLabel
      : selected?.label || (value ? value : placeholder);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      {/* Native required hook for form validation */}
      {required ? (
        <input
          tabIndex={-1}
          aria-hidden
          className="pointer-events-none absolute h-0 w-0 opacity-0"
          value={value}
          onChange={() => {}}
          required
        />
      ) : null}

      <button
        id={fieldId}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => !disabled && setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center gap-2 rounded-[var(--radius)] border border-border bg-white px-2.5 py-1.5 text-left text-[13px] text-text outline-none transition-all",
          "hover:border-border-strong focus:border-accent focus:ring-2 focus:ring-accent-bg",
          "disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-muted",
          !selected && !(allowEmpty && value === "") && "text-faint"
        )}
      >
        <span className="min-w-0 flex-1 truncate">{display}</span>
        {allowEmpty && value && !disabled ? (
          <span
            role="button"
            tabIndex={-1}
            className="rounded p-0.5 text-muted hover:bg-surface-2 hover:text-navy"
            onClick={(e) => {
              e.stopPropagation();
              pick("");
            }}
            aria-label="Clear"
          >
            <X className="h-3.5 w-3.5" />
          </span>
        ) : null}
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted", open && "rotate-180")} />
      </button>

      {open ? (
        <div
          className="absolute z-40 mt-1 w-full overflow-hidden rounded-[var(--radius)] border border-border bg-white shadow-[var(--shadow-card)]"
          role="listbox"
        >
          <div className="flex items-center gap-2 border-b border-border px-2.5 py-1.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted" />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="min-w-0 flex-1 border-0 bg-transparent py-1 text-[13px] text-text outline-none placeholder:text-faint"
              autoComplete="off"
            />
          </div>
          <ul className="m-0 max-h-56 list-none overflow-y-auto p-1">
            {allowEmpty ? (
              <li>
                <button
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px]",
                    value === "" ? "bg-accent-bg font-semibold text-navy" : "hover:bg-surface-2"
                  )}
                  onClick={() => pick("")}
                >
                  <span className="min-w-0 flex-1 truncate">{emptyOptionLabel}</span>
                  {value === "" ? <Check className="h-3.5 w-3.5 shrink-0 text-accent" /> : null}
                </button>
              </li>
            ) : null}
            {filtered.length === 0 ? (
              <li className="px-2 py-3 text-center text-xs text-muted">{emptyLabel}</li>
            ) : (
              filtered.map((opt) => {
                const active = opt.value === value;
                return (
                  <li key={opt.value}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px]",
                        active ? "bg-accent-bg font-semibold text-navy" : "hover:bg-surface-2"
                      )}
                      onClick={() => pick(opt.value)}
                    >
                      <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                      {active ? <Check className="h-3.5 w-3.5 shrink-0 text-accent" /> : null}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
