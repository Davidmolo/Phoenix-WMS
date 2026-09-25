"use client";

import { cn } from "@/lib/cn";
import { Card } from "./Card";
import { EmptyState } from "./EmptyState";
import { CenteredState, Spinner } from "./Spinner";

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
      <CenteredState>
        <Spinner />
      </CenteredState>
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
            <tr className="bg-[var(--surface-2)] text-left">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    "px-3 py-2.5 text-xs font-semibold tracking-wide text-muted uppercase",
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
                    "border-t border-border",
                    onRowClick && "cursor-pointer hover:bg-surface-2/70",
                    selected && "bg-accent-bg/40"
                  )}
                >
                  {columns.map((col) => (
                    <td key={col.key} className={cn("px-3 py-3 align-middle text-text", col.className)}>
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
