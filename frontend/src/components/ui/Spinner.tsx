import { cn } from "@/lib/cn";

export function Spinner({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "h-5 w-5 animate-spin rounded-full border-2 border-border border-t-accent",
        className
      )}
      aria-label="Loading"
    />
  );
}

export function CenteredState({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-[40vh] place-items-center text-sm text-muted">{children}</div>
  );
}
