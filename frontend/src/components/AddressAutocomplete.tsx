"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { MapPin } from "lucide-react";
import { Input } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";

type Suggestion = {
  id: string;
  label: string;
  address: string;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  id?: string;
};

/**
 * Free address autocomplete via OpenStreetMap Nominatim (proxied by our API — no Google key).
 */
export function AddressAutocomplete({
  value,
  onChange,
  placeholder = "Start typing an address…",
  required,
  disabled,
  className,
  id,
}: Props) {
  const { token } = useAuth();
  const listId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(-1);
  const skipNextFetch = useRef(false);

  useEffect(() => {
    if (skipNextFetch.current) {
      skipNextFetch.current = false;
      return;
    }
    const q = value.trim();
    if (!token || q.length < 3) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const t = window.setTimeout(async () => {
      try {
        const data = await api<{ suggestions: Suggestion[] }>(
          `/geo/address-suggest?q=${encodeURIComponent(q)}`,
          { token }
        );
        if (cancelled) return;
        setSuggestions(data.suggestions || []);
        setOpen(true);
        setActive(-1);
      } catch {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [value, token]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function pick(s: Suggestion) {
    skipNextFetch.current = true;
    onChange(s.address || s.label);
    setSuggestions([]);
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      pick(suggestions[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <Input
        id={id}
        value={value}
        disabled={disabled}
        required={required}
        placeholder={placeholder}
        autoComplete="off"
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={open && suggestions.length > 0}
        icon={<MapPin className="h-3.5 w-3.5" />}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (suggestions.length) setOpen(true);
        }}
        onKeyDown={onKeyDown}
      />
      {loading ? (
        <div className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[10px] font-semibold tracking-wide text-muted uppercase">
          …
        </div>
      ) : null}
      {open && suggestions.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-[var(--radius)] border border-border bg-white py-1 shadow-[var(--shadow-card)]"
        >
          {suggestions.map((s, i) => (
            <li key={s.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                className={cn(
                  "flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-surface-2",
                  i === active && "bg-surface-2"
                )}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(s)}
              >
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
                <span className="leading-snug text-navy">{s.label}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="m-0 mt-1 text-[11px] text-muted">
        Suggestions from OpenStreetMap (free). You can still type any address.
      </p>
    </div>
  );
}
