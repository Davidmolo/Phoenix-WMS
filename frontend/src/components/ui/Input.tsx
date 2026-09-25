import { cn } from "@/lib/cn";
import type { InputHTMLAttributes } from "react";

type Props = InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, ...props }: Props) {
  return (
    <input
      className={cn(
        "w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-text outline-none transition-shadow placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent-bg",
        className
      )}
      {...props}
    />
  );
}
