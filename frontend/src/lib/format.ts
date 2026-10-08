export function money(value?: number | null, fallback = "—"): string {
  if (value == null || Number.isNaN(value)) return fallback;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

export function dateLabel(value?: string | Date | null, fallback = "—"): string {
  if (!value) return fallback;
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleDateString();
}

export function dateTimeLabel(value?: string | Date | null, fallback = "—"): string {
  if (!value) return fallback;
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function titleCase(value?: string | null): string {
  if (!value) return "—";
  return value.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
