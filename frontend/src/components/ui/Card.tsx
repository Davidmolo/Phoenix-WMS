import { cn } from "@/lib/cn";
import type { HTMLAttributes, ReactNode } from "react";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  /** Hover lift (Paddock-style). Default true. Set false for dense tables / maps. */
  lift?: boolean;
};

export function Card({ className, lift = true, style, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] border border-border shadow-[var(--shadow)]",
        lift &&
          "transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)]",
        className
      )}
      style={{ background: "var(--blend-card)", ...style }}
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
