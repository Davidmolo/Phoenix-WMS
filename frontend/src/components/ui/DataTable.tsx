"use client";

import { cn } from "@/lib/cn";
import { Card } from "./Card";
import { EmptyState } from "./EmptyState";
import { Pagination } from "./Pagination";
import { SkeletonTable } from "./Skeleton";
import type { PaginationMeta } from "@/lib/pagination";

export type Column<T> = {
  key: string;
  header: string;
  className?: string;
  render: (row: T) => React.ReactNode;
};

type Props<T> = {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  onRowClick?: (row: T) => void;
  selectedKey?: string | null;
  pagination?: PaginationMeta | null;
  onPageChange?: (page: number) => void;
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  emptyTitle = "Nothing here yet",
  emptyDescription,
  onRowClick,
  selectedKey,
  pagination,
  onPageChange,
}: Props<T>) {
  if (loading) {
    return (
      <SkeletonTable
        cols={columns.length}
        rows={6}
        headers={columns.map((c) => c.header)}
      />
    );
  }

  if (!rows.length) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <Card className="overflow-hidden" lift={false}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="bg-[linear-gradient(90deg,#eef2f6_0%,#f7f3eb_55%,#eef2f6_100%)] text-left">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    "px-2.5 py-2 text-[10px] font-bold tracking-[0.05em] text-navy uppercase",
                    col.className
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const key = rowKey(row);
              const selected = selectedKey != null && selectedKey === key;
              return (
                <tr
                  key={key}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    "border-t border-border transition-colors",
                    onRowClick && "cursor-pointer hover:bg-accent-bg/30",
                    selected && "bg-accent-bg/40"
                  )}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn("px-2.5 py-2 align-middle text-text", col.className)}
                    >
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {pagination && onPageChange ? (
        <Pagination meta={pagination} onPageChange={onPageChange} />
      ) : null}
    </Card>
  );
}
