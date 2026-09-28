import { PackageOpen } from "lucide-react";
import { Card, CardBody } from "./Card";

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <Card className="border-dashed">
      <CardBody className="px-7 py-10 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--blend-soft)] text-accent">
          <PackageOpen className="h-6 w-6" />
        </div>
        <p className="m-0 text-sm font-semibold text-navy">{title}</p>
        {description ? <p className="mt-1.5 mb-0 text-[13px] text-muted">{description}</p> : null}
      </CardBody>
    </Card>
  );
}
