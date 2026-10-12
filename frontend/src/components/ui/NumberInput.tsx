"use client";

import { Input } from "./Input";
import type { InputHTMLAttributes } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> & {
  /** Controlled value — string so users can clear/type freely (not stuck on spinner steps). */
  value: string | number;
  onValueChange: (next: string) => void;
  /** Allow decimals (fees, rates). Default true. */
  decimal?: boolean;
};

/**
 * Typeable numeric field — no spinner buttons; empty string allowed while editing.
 * Parse with Number(...) only on submit / blur if needed.
 */
export function NumberInput({
  value,
  onValueChange,
  decimal = true,
  inputMode,
  ...rest
}: Props) {
  const display = value === undefined || value === null ? "" : String(value);
  return (
    <Input
      {...rest}
      type="text"
      inputMode={inputMode || (decimal ? "decimal" : "numeric")}
      autoComplete="off"
      value={display}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === "") {
          onValueChange("");
          return;
        }
        // Allow intermediate typing: "-", "12.", "0.0"
        const ok = decimal ? /^-?\d*\.?\d*$/.test(raw) : /^-?\d*$/.test(raw);
        if (ok) onValueChange(raw);
      }}
    />
  );
}
