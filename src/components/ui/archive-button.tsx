"use client";

import { useState, useTransition } from "react";
import type { FormState } from "@/lib/forms";
import { buttonClass } from "./button";

/** Botão de arquivar/reativar com confirmação e retorno acessível. */
export function ArchiveButton({ archived, onToggle }: { archived: boolean; onToggle: () => Promise<FormState> }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<FormState>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        className={buttonClass("ghost", "sm")}
        onClick={() => {
          if (!archived && !window.confirm("Arquivar este registro? Ele sai das listas ativas, mas o histórico é preservado.")) return;
          start(async () => setMsg(await onToggle()));
        }}
      >
        {pending ? "…" : archived ? "Reativar" : "Arquivar"}
      </button>
      {msg && !msg.ok ? <span role="alert" className="text-xs text-red-700">{msg.message}</span> : null}
    </span>
  );
}
