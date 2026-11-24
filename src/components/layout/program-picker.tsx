"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

/** Seletor de programa persistido na URL (?programa=). Funciona sem JS via botão "Aplicar". */
export function ProgramPicker({
  programs,
  value,
  allowAll = false,
  label = "Programa",
}: {
  programs: { id: string; label: string }[];
  value: string | null;
  allowAll?: boolean;
  label?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  return (
    <form method="get" className="flex flex-wrap items-end gap-2" onSubmit={(e) => e.preventDefault()}>
      <label className="text-sm">
        <span className="mb-1 block font-medium text-slate-800">{label}</span>
        <select
          name="programa"
          defaultValue={value ?? ""}
          aria-busy={pending}
          className="h-10 min-w-72 max-w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
          onChange={(e) => {
            const next = new URLSearchParams(params.toString());
            if (e.target.value) next.set("programa", e.target.value);
            else next.delete("programa");
            next.delete("pagina");
            start(() => router.push(`${pathname}?${next.toString()}`));
          }}
        >
          {allowAll ? <option value="">Todos os programas autorizados</option> : <option value="" disabled>Selecione…</option>}
          {programs.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
      </label>
      <noscript>
        <button type="submit" className="h-10 rounded-md border px-3 text-sm">Aplicar</button>
      </noscript>
    </form>
  );
}
