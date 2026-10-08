import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  // Long question-style labels wrap badly when forced to uppercase + wide tracking
  const longLabel = label.length > 28;

  return (
    <div className={cn("space-y-1", className)}>
      <label
        htmlFor={htmlFor}
        className={cn(
          "flex items-baseline gap-1 font-bold text-navy",
          longLabel
            ? "text-[12px] leading-snug tracking-normal normal-case"
            : "text-[10px] tracking-[0.06em] whitespace-nowrap uppercase"
        )}
      >
        <span className={longLabel ? "min-w-0" : undefined}>{label}</span>
        {required ? <span className="shrink-0 text-accent">*</span> : null}
      </label>
      {children}
      {error ? <p className="m-0 text-xs text-danger">{error}</p> : null}
      {!error && hint ? <p className="m-0 text-xs leading-snug text-muted">{hint}</p> : null}
    </div>
  );
}

export function FormGrid({
  cols = 2,
  children,
  className,
}: {
  cols?: 1 | 2 | 3 | 4;
  children: ReactNode;
  className?: string;
}) {
  const colClass =
    cols === 1
      ? "grid-cols-1"
      : cols === 4
        ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
        : cols === 3
          ? "grid-cols-1 sm:grid-cols-3"
          : "grid-cols-1 sm:grid-cols-2";
  return <div className={cn("grid gap-3 sm:gap-4", colClass, className)}>{children}</div>;
}

export function FormSection({
  title,
  description,
  icon,
  children,
  className,
  actions,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[var(--radius-lg)] border border-border shadow-[var(--shadow)]",
        "transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)]",
        className
      )}
      style={{ background: "var(--blend-card)" }}
    >
      <div className="flex flex-col gap-2 border-b border-border px-3 py-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-2 sm:px-4 sm:py-3">
        <div className="flex min-w-0 items-start gap-2">
          {icon ? (
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--blend-soft)] text-accent">
              {icon}
            </div>
          ) : null}
          <div className="min-w-0">
            <h2 className="font-display m-0 truncate text-[12px] font-semibold tracking-[0.04em] text-navy uppercase sm:text-[13px]">
              {title}
            </h2>
            {description ? (
              <p className="mt-0.5 mb-0 line-clamp-2 text-[11.5px] leading-snug text-muted sm:text-xs">
                {description}
              </p>
            ) : null}
          </div>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-1.5">{actions}</div> : null}
      </div>
      <div className="px-3 py-3 sm:px-4 sm:py-3.5">{children}</div>
    </div>
  );
}

export function CheckboxField({
  checked,
  onChange,
  children,
  id,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
  id?: string;
}) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start gap-3 rounded-[var(--radius)] border border-border bg-surface-2/60 px-3.5 py-3 text-sm leading-snug text-muted transition-colors hover:border-border-strong hover:bg-surface-2"
    >
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-[var(--accent)]"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{children}</span>
    </label>
  );
}
