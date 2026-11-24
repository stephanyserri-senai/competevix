"use client";

import { useState, useTransition } from "react";
import type { FormState } from "@/lib/forms";
import { buttonClass } from "./button";

/** Botão que executa uma Server Action vinculada, com confirmação opcional. */
export function RunButton({ label, onRun, confirm, variant = "ghost" }: { label: string; onRun: () => Promise<FormState>; confirm?: string; variant?: "ghost" | "secondary" | "danger" | "primary" }) {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<FormState>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        className={buttonClass(variant, "sm")}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          start(async () => setRes(await onRun()));
        }}
      >
        {pending ? "…" : label}
      </button>
      {res && !res.ok ? <span role="alert" className="text-xs text-red-700">{res.message}</span> : null}
    </span>
  );
}
