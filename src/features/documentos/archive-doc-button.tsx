"use client";

import { useState, useTransition } from "react";
import { archiveDocument } from "./actions";
import { buttonClass } from "@/components/ui/button";

export function ArchiveDocButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <span>
      <button
        type="button"
        disabled={pending}
        className={buttonClass("ghost", "sm")}
        onClick={() => {
          if (!window.confirm("Arquivar este documento? O arquivo e o histórico são preservados.")) return;
          start(async () => {
            const r = await archiveDocument(id);
            setErr(r.ok ? null : r.message);
          });
        }}
      >
        Arquivar
      </button>
      {err ? <span role="alert" className="text-xs text-red-700">{err}</span> : null}
    </span>
  );
}
