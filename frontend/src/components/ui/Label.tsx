import { cn } from "@/lib/cn";
import type { LabelHTMLAttributes } from "react";

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn(
        "mb-1.5 block text-[11px] font-bold tracking-[0.07em] text-navy uppercase",
        className
      )}
      {...props}
    />
  );
}
