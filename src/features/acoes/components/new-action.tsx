"use client";

import { useActionState, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { quickCreateAction } from "../actions";
import { THEME_LABEL } from "@/features/bi/domain";
import { buttonClass } from "@/components/ui/button";
import type { FormState } from "@/lib/forms";

type Opt = { id: string; label: string };

/** Nova ação em poucos campos; opções avançadas ficam recolhidas. */
export function NewActionButton({ programs, teams, people, defaultProgramId }: {
  programs: (Opt & { canGeneral: boolean })[];
  teams: (Opt & { programId: string })[];
  people: Opt[];
  defaultProgramId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(async (prev, fd) => {
    const r = await quickCreateAction(prev, fd);
    if (r?.ok) setOpen(false);
    return r;
  }, null);
  const [program, setProgram] = useState(defaultProgramId ?? programs[0]?.id ?? "");
  const teamOptions = useMemo(() => teams.filter((t) => t.programId === program), [teams, program]);
  const canGeneral = programs.find((p) => p.id === program)?.canGeneral ?? false;
  if (!programs.length) return null;
  const field = "mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm";
  return (
    <>
      <button type="button" className={buttonClass("accent")} onClick={() => setOpen(true)}><Plus className="size-4" aria-hidden /> Nova ação</button>
      {state?.ok && !open ? <span role="status" className="text-sm text-emerald-700">{state.message}</span> : null}
      {open ? (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="new-action-title">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <form action={action} className="relative flex h-full w-full max-w-md flex-col gap-4 overflow-y-auto bg-white p-6 shadow-2xl" onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}>
            <div className="flex items-center justify-between">
              <h2 id="new-action-title" className="text-lg font-semibold text-slate-900">Nova ação</h2>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Fechar"><X className="size-5" /></button>
            </div>
            <label className="text-sm font-medium text-slate-700">O que precisa ser feito? *
              <input name="title" required minLength={3} maxLength={200} autoFocus className={field} placeholder="Ex.: Levantar insumos do posto de treino" />
            </label>
            <label className="text-sm font-medium text-slate-700">Frente *
              <select name="program_id" value={program} onChange={(e) => setProgram(e.target.value)} className={field}>
                {programs.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm font-medium text-slate-700">Responsável
                <select name="owner_person_id" defaultValue="" className={field}>
                  <option value="">A definir</option>
                  {people.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">Prazo
                <input name="due_date" type="date" className={field} />
              </label>
              <label className="text-sm font-medium text-slate-700">Tema
                <select name="theme" defaultValue="" className={field}>
                  <option value="">—</option>
                  {Object.entries(THEME_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">Equipe
                <select name="team_id" key={program} defaultValue={canGeneral ? "" : teamOptions[0]?.id ?? ""} className={field}>
                  {canGeneral ? <option value="">Geral da frente</option> : null}
                  {teamOptions.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </label>
            </div>
            <details className="rounded-xl bg-slate-50 p-3 text-sm">
              <summary className="cursor-pointer font-medium text-slate-700">Mais opções</summary>
              <div className="mt-3 space-y-3">
                <label className="block text-sm font-medium text-slate-700">Prioridade
                  <select name="priority" defaultValue="media" className={field}>
                    <option value="baixa">Baixa</option><option value="media">Média</option><option value="alta">Alta</option><option value="critica">Crítica</option>
                  </select>
                </label>
                <label className="block text-sm font-medium text-slate-700">Descrição
                  <textarea name="description" rows={3} maxLength={4000} className={field} />
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" name="requires_evidence" className="size-4" /> Exigir evidência para concluir</label>
              </div>
            </details>
            {state && !state.ok ? <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{state.message}{state.fieldErrors ? ` ${Object.values(state.fieldErrors).flat().filter(Boolean).join(" ")}` : ""}</p> : null}
            <div className="mt-auto flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" onClick={() => setOpen(false)} className="rounded-xl px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">Cancelar</button>
              <button type="submit" disabled={pending} className={buttonClass("primary")}>{pending ? "Salvando…" : "Criar ação"}</button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
