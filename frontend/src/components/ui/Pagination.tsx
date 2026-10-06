"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./Button";
import type { PaginationMeta } from "@/lib/pagination";

type Props = {
  meta: PaginationMeta;
  onPageChange: (page: number) => void;
  className?: string;
};

export function Pagination({ meta, onPageChange, className }: Props) {
  const { page, total, totalPages, limit } = meta;
  if (total <= 0) return null;

  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const canPrev = page > 1;
  const canNext = page < totalPages;

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface-2/40 px-3.5 py-2.5 text-xs text-muted ${className ?? ""}`}
    >
      <span>
        Showing <span className="font-semibold text-text">{from}–{to}</span> of{" "}
        <span className="font-semibold text-text">{total}</span>
      </span>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={!canPrev}
          onClick={() => onPageChange(page - 1)}
          icon={<ChevronLeft className="h-3.5 w-3.5" />}
        >
          Prev
        </Button>
        <span className="min-w-[4.5rem] text-center font-semibold text-text">
          {page} / {totalPages}
        </span>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={!canNext}
          onClick={() => onPageChange(page + 1)}
          icon={<ChevronRight className="h-3.5 w-3.5" />}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
