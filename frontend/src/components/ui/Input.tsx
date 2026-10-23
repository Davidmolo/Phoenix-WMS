import { cn } from "@/lib/cn";
import { forwardRef, type InputHTMLAttributes, ReactNode } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  icon?: ReactNode;
};

/** Shared field styles — number spinners hidden so staff can type values freely. */
const baseInputClass =
  "w-full rounded-[var(--radius)] border border-border bg-white text-[13px] text-text outline-none transition-all placeholder:text-faint " +
  "hover:border-border-strong focus:border-accent focus:ring-2 focus:ring-accent-bg " +
  "disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-muted " +
  "read-only:bg-surface-2 read-only:text-navy " +
  "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

export const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { className, icon, ...props },
  ref
) {
  if (icon) {
    return (
      <div className="relative">
        <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint">
          {icon}
        </span>
        <input ref={ref} className={cn(baseInputClass, "py-1.5 pr-3 pl-9", className)} {...props} />
      </div>
    );
  }

  return <input ref={ref} className={cn(baseInputClass, "px-2.5 py-1.5", className)} {...props} />;
});
