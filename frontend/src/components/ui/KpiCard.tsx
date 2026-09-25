import { Card, CardBody } from "./Card";

export function KpiCard({
  label,
  value,
  hint,
}: {
  label: string;
  value?: string | number | null;
  hint?: string;
}) {
  return (
    <Card>
      <CardBody>
        <div className="text-[11px] font-semibold tracking-[0.04em] text-muted uppercase">{label}</div>
        <div className="mt-1.5 text-[26px] leading-none font-bold tabular-nums text-text">
          {value ?? "—"}
        </div>
        {hint ? <div className="mt-1.5 text-xs text-muted">{hint}</div> : null}
      </CardBody>
    </Card>
  );
}

export function KpiGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
      {children}
    </div>
  );
}
