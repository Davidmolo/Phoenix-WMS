"use client";

import { AlertTriangle, FileText, Mail, Printer } from "lucide-react";
import { Button, Modal } from "@/components/ui";
import type { BolCompleteness } from "@/lib/bolGate";

export function BolDocumentConfirmModal({
  open,
  action,
  completeness,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  action: "print" | "email";
  completeness: BolCompleteness;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const isPrint = action === "print";
  const verb = isPrint ? "print" : "email";
  const ActionIcon = isPrint ? Printer : Mail;

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title="Incomplete Bill of Lading"
      description={`Some BOL fields are still empty. You can fill them in now, or ${verb} without them.`}
      size="md"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          <Button type="button" variant="secondary" onClick={onCancel} className="w-full sm:w-auto">
            Fill in details
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={onConfirm}
            icon={<ActionIcon className="h-4 w-4" />}
            className="w-full sm:w-auto"
          >
            {isPrint ? "Print anyway" : "Email anyway"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-3 rounded-[var(--radius-lg)] border border-[rgba(230,160,48,0.35)] bg-accent-bg/80 px-3.5 py-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/80 text-[var(--accent-text)] shadow-sm">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0 pt-0.5">
            <p className="m-0 text-sm font-semibold text-navy">
              Do you want to {verb} the BOL without filling this information?
            </p>
            <p className="m-0 mt-1 text-xs leading-relaxed text-muted">
              The PDF will still open — missing fields may show as blank on the document.
            </p>
          </div>
        </div>

        {completeness.missing.length > 0 ? (
          <div>
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
              <FileText className="h-3.5 w-3.5" />
              Still missing
            </div>
            <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
              {completeness.missing.map((item) => (
                <li
                  key={item}
                  className="rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs font-medium text-navy"
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
