import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, type Tone } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { ActionForm } from "@/components/ui/action-form";
import { SelectField, TextField, TextareaField } from "@/components/ui/field-errors";
import { ProgramPicker } from "@/components/layout/program-picker";
import { hasRole, requireAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime, todayLocal } from "@/lib/dates";
import { listPrograms, pickProgram, programLabel } from "@/features/programas/queries";
import { listPeopleOptions } from "@/features/equipes/queries";
import { reviewRisk, saveRisk } from "@/features/gestao-actions";
import { RISK_LEVEL_LABEL, RISK_STATUS_LABEL, riskLevel, riskMatrix, type RiskLevel } from "@/features/riscos/domain";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Riscos" };
const LEVEL_TONE: Record<RiskLevel, Tone> = { baixo: "success", moderado: "info", alto: "warning", critico: "danger" };
const CELL: Record<RiskLevel, string> = { baixo: "bg-emerald-50", moderado: "bg-sky-50", alto: "bg-amber-100", critico: "bg-red-100" };

export default async function RiscosPage({ searchParams }: PageProps<"/riscos">) {
  const sp = await searchParams;
  const access = await requireAccess();
  const supabase = await createClient();
  const programs = await listPrograms(supabase);
  const program = pickProgram(programs, sp.programa) ?? programs[0] ?? null;
  const header = <PageHeader eyebrow="RF12" title="Riscos" description="Probabilidade e impacto de 1 a 5, mitigação, responsável, prazo e revisão periódica. Toda reavaliação fica no histórico." />;
  if (!program) return <>{header}<EmptyState title="Nenhum programa no seu escopo" /></>;
  const canManage = hasRole(access, program.id, "supervisao", "orientador");
  const isSup = hasRole(access, program.id, "supervisao");
  const [{ data: risks }, { data: teams }, people] = await Promise.all([
    supabase.from("risks").select("*, owner:people(full_name), team:teams(name), reviews:risk_reviews(probability, impact, status, note, reviewed_at)").eq("program_id", program.id).is("archived_at", null).order("score", { ascending: false }),
    supabase.from("teams").select("id, name").eq("program_id", program.id).is("archived_at", null).order("name"),
    listPeopleOptions(supabase),
  ]);
  const m = riskMatrix(risks ?? []);
  const today = todayLocal();

  return (
    <>
      {header}
      <div className="mb-6"><ProgramPicker programs={programs.map((p) => ({ id: p.id, label: programLabel(p) }))} value={program.id} /></div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Matriz de riscos ativos" description="Linhas: probabilidade (5 = muito provável). Colunas: impacto (5 = muito alto)." />
            <CardBody>
              <div className="overflow-x-auto">
                <table className="text-center text-sm">
                  <caption className="sr-only">Quantidade de riscos por probabilidade e impacto</caption>
                  <thead><tr><th scope="col" className="p-1 text-xs text-slate-500">P \ I</th>{[1, 2, 3, 4, 5].map((i) => <th key={i} scope="col" className="w-14 p-1 text-xs">{i}</th>)}</tr></thead>
                  <tbody>{[5, 4, 3, 2, 1].map((p) => (
                    <tr key={p}><th scope="row" className="p-1 text-xs">{p}</th>{[1, 2, 3, 4, 5].map((i) => (
                      <td key={i} className={cn("h-12 w-14 border border-white font-semibold", CELL[riskLevel(p * i)])} aria-label={`Probabilidade ${p}, impacto ${i}: ${m[p - 1][i - 1]} risco(s)`}>{m[p - 1][i - 1] || ""}</td>
                    ))}</tr>
                  ))}</tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-slate-500">Níveis: 1–4 baixo · 5–9 moderado · 10–14 alto · 15–25 crítico (riscos críticos sem revisão em dia geram alerta).</p>
            </CardBody>
          </Card>
          {(risks ?? []).length === 0 ? <EmptyState title="Nenhum risco registrado" /> : (risks ?? []).map((r) => {
            const lvl = riskLevel(r.score ?? r.probability * r.impact);
            const overdue = r.status !== "fechado" && r.next_review && r.next_review < today;
            return (
              <Card key={r.id} as="article">
                <CardHeader title={<>{r.title} <Badge tone={LEVEL_TONE[lvl]}>{RISK_LEVEL_LABEL[lvl]} · {r.score}</Badge></>}
                  description={`${r.team?.name ?? "Programa"} · P${r.probability} × I${r.impact} · ${RISK_STATUS_LABEL[r.status]}${r.owner ? ` · ${r.owner.full_name}` : ""}${r.due_date ? ` · prazo ${formatDate(r.due_date)}` : ""}`}
                  actions={overdue ? <Badge tone="danger">Revisão vencida</Badge> : r.next_review ? <Badge>Revisar em {formatDate(r.next_review)}</Badge> : null} />
                <CardBody className="space-y-2 text-sm">
                  {r.description ? <p className="text-slate-700">{r.description}</p> : null}
                  <p><strong>Mitigação:</strong> {r.mitigation ?? "—"}</p>
                  <details><summary className="cursor-pointer text-xs text-brand-700">Histórico ({r.reviews.length})</summary>
                    <ul className="mt-1 space-y-0.5 text-xs text-slate-600">{[...r.reviews].sort((a, b) => (a.reviewed_at < b.reviewed_at ? 1 : -1)).map((h, i) => (
                      <li key={i}>{formatDateTime(h.reviewed_at)}: P{h.probability} × I{h.impact} · {RISK_STATUS_LABEL[h.status]}{h.note ? ` — ${h.note}` : ""}</li>
                    ))}</ul>
                  </details>
                  {canManage ? (
                    <details><summary className="cursor-pointer text-sm text-brand-700">Reavaliar</summary>
                      <ActionForm action={reviewRisk} schema="riskReview" submitLabel="Registrar reavaliação" submitVariant="secondary" className="mt-2 grid gap-3 sm:grid-cols-3">
                        <input type="hidden" name="id" value={r.id} />
                        <TextField id={`p-${r.id}`} name="probability" type="number" min={1} max={5} label="Probabilidade" defaultValue={r.probability} />
                        <TextField id={`i-${r.id}`} name="impact" type="number" min={1} max={5} label="Impacto" defaultValue={r.impact} />
                        <SelectField id={`s-${r.id}`} name="status" label="Situação" defaultValue={r.status}>
                          {Object.entries(RISK_STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </SelectField>
                        <TextareaField id={`m-${r.id}`} name="mitigation" label="Mitigação" defaultValue={r.mitigation ?? ""} className="sm:col-span-2" />
                        <TextField id={`n-${r.id}`} name="next_review" type="date" label="Próxima revisão" defaultValue={r.next_review ?? ""} />
                        <TextField id={`c-${r.id}`} name="note" label="Comentário da revisão" required className="sm:col-span-3" />
                      </ActionForm>
                    </details>
                  ) : null}
                </CardBody>
              </Card>
            );
          })}
        </div>
        {canManage ? (
          <Card>
            <CardHeader title="Novo risco" />
            <CardBody>
              <ActionForm action={saveRisk} schema="risk" resetOnSuccess submitLabel="Registrar">
                <input type="hidden" name="program_id" value={program.id} />
                <TextField name="title" label="Risco" required />
                <TextareaField name="description" label="Descrição" />
                <div className="grid grid-cols-2 gap-3">
                  <TextField name="probability" type="number" min={1} max={5} label="Probabilidade (1–5)" defaultValue={3} required />
                  <TextField name="impact" type="number" min={1} max={5} label="Impacto (1–5)" defaultValue={3} required />
                  <SelectField name="team_id" label="Equipe" defaultValue="">
                    {isSup ? <option value="">Programa</option> : <option value="" disabled>Selecione…</option>}
                    {(teams ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </SelectField>
                  <TextField name="category" label="Categoria" />
                  <TextField name="due_date" type="date" label="Prazo da mitigação" />
                  <TextField name="next_review" type="date" label="Próxima revisão" />
                </div>
                <SelectField name="owner_person_id" label="Responsável" defaultValue="">
                  <option value="">A definir</option>
                  {people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                </SelectField>
                <TextareaField name="mitigation" label="Mitigação" />
              </ActionForm>
            </CardBody>
          </Card>
        ) : null}
      </div>
    </>
  );
}
