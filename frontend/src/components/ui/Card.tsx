import { cn } from "@/lib/cn";
import type { HTMLAttributes, ReactNode } from "react";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] border border-border shadow-[var(--shadow)]",
        className
      )}
      style={{ background: "var(--blend-card)" }}
      {...props}
    />
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4", className)} {...props} />;
}

export function CardTitle({
  children,
  className,
  icon,
}: {
  children: ReactNode;
  className?: string;
  icon?: ReactNode;
}) {
  return (
    <h2
      className={cn(
        "font-display m-0 flex items-center gap-2 text-[15px] font-semibold tracking-wide text-navy uppercase",
        className
      )}
    >
      {icon ? <span className="text-accent">{icon}</span> : null}
      {children}
    </h2>
  );
}
