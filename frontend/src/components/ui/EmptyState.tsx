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
      <CardBody className="px-7 py-8 text-center">
        <p className="m-0 text-sm font-semibold text-text">{title}</p>
        {description ? <p className="mt-1.5 mb-0 text-[13px] text-muted">{description}</p> : null}
      </CardBody>
    </Card>
  );
}
