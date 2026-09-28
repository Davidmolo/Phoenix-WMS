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
  return (
    <div className={cn("space-y-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="flex items-baseline gap-1 text-[11px] font-bold tracking-[0.07em] text-navy uppercase"
      >
        {label}
        {required ? <span className="text-accent">*</span> : null}
      </label>
      {children}
      {error ? <p className="m-0 text-xs text-danger">{error}</p> : null}
      {!error && hint ? <p className="m-0 text-xs leading-relaxed text-muted">{hint}</p> : null}
    </div>
  );
}

export function FormGrid({
  cols = 2,
  children,
  className,
}: {
  cols?: 1 | 2 | 3;
  children: ReactNode;
  className?: string;
}) {
  const colClass =
    cols === 1
      ? "grid-cols-1"
      : cols === 3
        ? "grid-cols-1 sm:grid-cols-3"
        : "grid-cols-1 sm:grid-cols-2";
  return <div className={cn("grid gap-4", colClass, className)}>{children}</div>;
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
        className
      )}
      style={{ background: "var(--blend-card)" }}
    >
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3 sm:px-5 sm:py-4">
        <div className="flex min-w-0 items-start gap-3">
          {icon ? (
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--blend-soft)] text-accent">
              {icon}
            </div>
          ) : null}
          <div className="min-w-0">
            <h2 className="font-display m-0 text-[14px] font-semibold tracking-[0.04em] text-navy uppercase sm:text-[15px]">
              {title}
            </h2>
            {description ? (
              <p className="mt-1 mb-0 text-[12.5px] leading-relaxed text-muted sm:text-[13px]">
                {description}
              </p>
            ) : null}
          </div>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>
      <div className="px-4 py-4 sm:px-5 sm:py-5">{children}</div>
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
