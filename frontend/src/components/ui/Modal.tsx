"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Shared edit / dialog overlay used across WMS (billing, customers, etc.).
 * Matches existing print-modal overlay styling.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "lg",
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "md" | "lg" | "xl";
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const maxW =
    size === "md" ? "max-w-lg" : size === "xl" ? "max-w-4xl" : "max-w-2xl";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-navy-deep/50 p-3 backdrop-blur-sm sm:items-center sm:p-6"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "flex max-h-[92vh] w-full flex-col overflow-hidden rounded-[var(--radius-xl)] border border-border bg-white shadow-[var(--shadow-card)]",
          maxW,
          className
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 className="font-display m-0 text-sm font-semibold tracking-wide text-navy uppercase">
              {title}
            </h2>
            {description ? (
              <p className="m-0 mt-1 text-xs leading-relaxed text-muted">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            className="shrink-0 rounded-lg border border-border p-2 text-muted hover:bg-surface-2 hover:text-navy"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">{children}</div>
        {footer ? (
          <div className="shrink-0 border-t border-border bg-surface-2/40 px-4 py-3 sm:px-5 [&>div]:flex [&>div]:flex-wrap [&>div]:items-center [&>div]:justify-end [&>div]:gap-2">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
