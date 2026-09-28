"use client";

import { cn } from "@/lib/cn";
import { Card } from "./Card";
import { EmptyState } from "./EmptyState";
import { SkeletonTable } from "./Skeleton";

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
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13.5px]">
          <thead>
            <tr className="bg-[linear-gradient(90deg,#eef2f6,#f7f3eb)] text-left">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    "px-3.5 py-3 text-[11px] font-bold tracking-[0.06em] text-navy uppercase",
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
                      className={cn("px-3.5 py-3 align-middle text-text", col.className)}
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
    </Card>
  );
}
