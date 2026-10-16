"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Button } from "./Button";
import { Field } from "./Field";
import { Input } from "./Input";
import { Modal } from "./Modal";

type ConfirmOpts = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

type PromptOpts = {
  title: string;
  message?: string;
  label?: string;
  placeholder?: string;
  confirmLabel?: string;
};

type DialogApi = {
  confirm: (opts: ConfirmOpts) => Promise<boolean>;
  prompt: (opts: PromptOpts) => Promise<string | null>;
};

const DialogContext = createContext<DialogApi | null>(null);

export function useDialog() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useDialog must be used inside DialogProvider");
  return ctx;
}

type Open =
  | { kind: "confirm"; opts: ConfirmOpts }
  | { kind: "prompt"; opts: PromptOpts; value: string };

export function DialogProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<Open | null>(null);
  const resolveRef = useRef<(value: boolean | string | null) => void>(() => {});

  const finish = useCallback((value: boolean | string | null) => {
    resolveRef.current(value);
    setOpen(null);
  }, []);

  const confirm = useCallback((opts: ConfirmOpts) => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = (value) => resolve(value === true);
      setOpen({ kind: "confirm", opts });
    });
  }, []);

  const prompt = useCallback((opts: PromptOpts) => {
    return new Promise<string | null>((resolve) => {
      resolveRef.current = (value) => resolve(typeof value === "string" ? value : null);
      setOpen({ kind: "prompt", opts, value: "" });
    });
  }, []);

  const promptValue = open?.kind === "prompt" ? open.value : "";

  return (
    <DialogContext.Provider value={{ confirm, prompt }}>
      {children}
      <Modal
        open={Boolean(open)}
        onClose={() => finish(open?.kind === "prompt" ? null : false)}
        title={open?.opts.title || "Confirm"}
        description={open?.kind === "confirm" ? open.opts.message : open?.opts.message}
        size="md"
        footer={
          <div>
            <Button type="button" variant="secondary" onClick={() => finish(open?.kind === "prompt" ? null : false)}>
              {open?.kind === "confirm" ? open.opts.cancelLabel || "Cancel" : "Cancel"}
            </Button>
            <Button
              type="button"
              variant={open?.kind === "confirm" && open.opts.danger ? "danger" : "primary"}
              disabled={open?.kind === "prompt" && !promptValue.trim()}
              onClick={() => {
                if (!open) return;
                if (open.kind === "confirm") finish(true);
                else finish(open.value.trim());
              }}
            >
              {open?.kind === "confirm"
                ? open.opts.confirmLabel || "Confirm"
                : open?.opts.confirmLabel || "Continue"}
            </Button>
          </div>
        }
      >
        {open?.kind === "prompt" ? (
          <Field label={open.opts.label || "Reason"}>
            <Input
              value={open.value}
              autoFocus
              placeholder={open.opts.placeholder}
              onChange={(e) =>
                setOpen((current) =>
                  current?.kind === "prompt" ? { ...current, value: e.target.value } : current
                )
              }
              onKeyDown={(e) => {
                if (e.key === "Enter" && promptValue.trim()) finish(promptValue.trim());
              }}
            />
          </Field>
        ) : (
          <p className="m-0 text-sm text-muted">{open?.kind === "confirm" ? open.opts.message : ""}</p>
        )}
      </Modal>
    </DialogContext.Provider>
  );
}
