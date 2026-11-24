import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { ActionForm } from "@/components/ui/action-form";
import { SelectField, TextField, TextareaField } from "@/components/ui/field-errors";
import { RunButton } from "@/components/ui/run-button";
import { hasRole, requireAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime } from "@/lib/dates";
import { listPeopleOptions } from "@/features/equipes/queries";
import { addResult, publishAssessment, removeResult, saveAssessmentError } from "@/features/worldskills/actions";
import { ASSESSMENT_TYPE_LABEL, SCALE_LABEL, deviation, formatMinutes, rampTargetFor, type Scale } from "@/features/worldskills/domain";
import type { Tables } from "@/lib/database.types";

const ERR_STATUS = { aberta: "Aberta", em_andamento: "Em andamento", concluida: "Concluída" } as const;

export default async function SimuladoPage({ params }: PageProps<"/worldskills/simulados/[id]">) {
  const { id } = await params;
  const access = await requireAccess();
  const supabase = await createClient();
  const { data: a } = await supabase.from("assessments").select("*, team:teams(name), occupation:occupations(id, code, name, target_score, target_scale)").eq("id", id).maybeSingle();
  if (!a) notFound();
  const [{ data: results }, { data: errors }, { data: ramp }, { data: comps }, people] = await Promise.all([
    supabase.from("assessment_results").select("*, person:people(full_name)").eq("assessment_id", id).order("created_at"),
    supabase.from("assessment_errors").select("*, competency:competencies(name), owner:people(full_name)").eq("assessment_id", id).order("created_at"),
    a.occupation_id ? supabase.from("score_targets").select("occupation_id, month, target, scale, status").eq("occupation_id", a.occupation_id) : Promise.resolve({ data: [] }),
    supabase.from("competencies").select("id, name, occupation_id").eq("program_id", a.program_id).is("archived_at", null),
    listPeopleOptions(supabase),
  ]);
  const canEdit = hasRole(access, a.program_id, "supervisao") || hasRole(access, a.program_id, "orientador");
  const draft = a.status === "rascunho";
  const teamResult = (results ?? []).find((r) => r.person_id === null && r.criterion === null);
  const rampT = a.occupation_id ? rampTargetFor((ramp ?? []).map((r) => ({ ...r, target: Number(r.target), scale: r.scale as Scale })), a.occupation_id, a.held_on, a.scale as Scale) : null;
  const comparableFinal = a.occupation && a.occupation.target_scale === a.scale ? (a.occupation.target_score !== null ? Number(a.occupation.target_score) : null) : null;

  return (
    <>
      <PageHeader
        eyebrow={`Simulado ${ASSESSMENT_TYPE_LABEL[a.type]} · ${a.team?.name}`}
        title={a.title}
        description={`${formatDate(a.held_on)} · ${SCALE_LABEL[a.scale as Scale]} (máx. ${Number(a.scale_max)})${a.test_version ? ` · prova ${a.test_version}` : ""}${a.criteria_version ? ` · critérios ${a.criteria_version}` : ""}${a.planned_minutes ? ` · tempo ${formatMinutes(a.actual_minutes ?? 0)} de ${formatMinutes(a.planned_minutes)}` : ""}`}
        actions={
          <>
            <Link href={`/worldskills?programa=${a.program_id}&aba=simulados`} className="text-sm text-brand-700 hover:underline">← Simulados</Link>
            {canEdit && draft ? <RunButton variant="primary" label="Publicar" onRun={publishAssessment.bind(null, id)} confirm="Publicar? As notas ficam congeladas." /> : null}
          </>
        }
      />
      {!draft ? <Alert tone="success" className="mb-4">Publicado em {formatDateTime(a.published_at)}: notas congeladas.</Alert> : null}

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Box label="Nota da equipe" value={teamResult ? String(Number(teamResult.score)) : "Sem dados"} />
        <Box label="Desvio vs. rampa do mês" value={rampT && teamResult ? String(deviation(Number(teamResult.score), rampT.target)) : "N/A"}
          detail={rampT ? `meta ${rampT.target} (${rampT.status})` : "sem meta mensal na mesma escala"} />
        <Box label="Distância da meta final" value={comparableFinal !== null && teamResult ? String(deviation(Number(teamResult.score), comparableFinal)) : "N/A"}
          detail={a.occupation ? (a.occupation.target_scale === a.scale ? `meta ${a.occupation.target_score}` : "escala diferente da meta — sem comparação") : "sem ocupação"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Notas" description="Resultado da equipe (sem pessoa e sem critério) é o usado nos indicadores." />
            <CardBody>
              {(results ?? []).length === 0 ? <p className="text-sm text-slate-600">Nenhuma nota registrada.</p> : (
                <Table caption="Notas">
                  <thead><tr><Th>Quem</Th><Th>Critério</Th><Th className="text-right">Nota</Th>{canEdit && draft ? <Th><span className="sr-only">Ações</span></Th> : null}</tr></thead>
                  <tbody>{(results ?? []).map((r) => (
                    <Tr key={r.id}><Td>{r.person?.full_name ?? "Equipe"}</Td><Td className="text-xs">{r.criterion ?? "Geral"}</Td><Td className="text-right font-medium">{Number(r.score)}</Td>
                      {canEdit && draft ? <Td><RunButton label="Remover" onRun={removeResult.bind(null, id, r.id)} /></Td> : null}</Tr>
                  ))}</tbody>
                </Table>
              )}
              {canEdit && draft ? (
                <ActionForm action={addResult} schema="result" resetOnSuccess submitLabel="Registrar nota" submitVariant="secondary" className="mt-4 grid gap-3 sm:grid-cols-4">
                  <input type="hidden" name="assessment_id" value={id} />
                  <input type="hidden" name="program_id" value={a.program_id} />
                  <SelectField name="person_id" label="Quem" defaultValue="">
                    <option value="">Equipe</option>
                    {people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                  </SelectField>
                  <TextField name="criterion" label="Critério (opcional)" />
                  <TextField name="score" type="number" step="0.01" min={0} max={Number(a.scale_max)} label="Nota" required />
                </ActionForm>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Análise de erros" description="Erro → causa raiz → ação corretiva (meta: 100% dos erros analisados)." />
            <CardBody className="space-y-3">
              {(errors ?? []).length === 0 ? <EmptyState title="Nenhum erro registrado" /> : (errors ?? []).map((e) => (
                <details key={e.id} className="rounded-md border border-slate-200 p-3">
                  <summary className="cursor-pointer text-sm">
                    <span className="font-medium">{e.description}</span> <Badge tone={e.status === "concluida" ? "success" : e.root_cause ? "info" : "warning"}>{ERR_STATUS[e.status]}</Badge>
                    <span className="ml-1 text-xs text-slate-500">{e.competency?.name ?? ""}{e.owner ? ` · ${e.owner.full_name}` : ""}{e.due_date ? ` · ${formatDate(e.due_date)}` : ""}</span>
                  </summary>
                  <div className="mt-3">{canEdit ? <ErrorForm a={a} comps={comps ?? []} people={people} e={e} /> : (
                    <p className="text-sm">Causa: {e.root_cause ?? "—"}<br />Ação: {e.corrective_action ?? "—"}</p>
                  )}</div>
                </details>
              ))}
            </CardBody>
          </Card>
        </div>
        {canEdit ? (
          <Card>
            <CardHeader title="Registrar erro" />
            <CardBody><ErrorForm a={a} comps={comps ?? []} people={people} /></CardBody>
          </Card>
        ) : null}
      </div>
    </>
  );
}

function Box({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium text-slate-600">{label}</p>
      <p className={value === "N/A" || value === "Sem dados" ? "text-lg font-semibold text-slate-500" : "text-2xl font-bold text-brand-900"}>{value}</p>
      {detail ? <p className="text-xs text-slate-600">{detail}</p> : null}
    </div>
  );
}

function ErrorForm({ a, comps, people, e }: {
  a: Tables<"assessments">;
  comps: { id: string; name: string; occupation_id: string }[];
  people: { id: string; full_name: string }[];
  e?: Tables<"assessment_errors">;
}) {
  const k = e?.id ?? "novo";
  return (
    <ActionForm action={saveAssessmentError} schema="assessmentError" resetOnSuccess={!e} submitLabel="Salvar" submitVariant={e ? "secondary" : "primary"}>
      {e ? <input type="hidden" name="id" value={e.id} /> : null}
      <input type="hidden" name="assessment_id" value={a.id} />
      <input type="hidden" name="program_id" value={a.program_id} />
      <TextareaField id={`d-${k}`} name="description" label="Erro observado" defaultValue={e?.description} required />
      <SelectField id={`c-${k}`} name="competency_id" label="Competência" defaultValue={e?.competency_id ?? ""}>
        <option value="">—</option>
        {comps.filter((c) => !a.occupation_id || c.occupation_id === a.occupation_id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </SelectField>
      <TextareaField id={`r-${k}`} name="root_cause" label="Causa raiz" defaultValue={e?.root_cause ?? ""} />
      <TextareaField id={`a-${k}`} name="corrective_action" label="Ação corretiva / plano de melhoria" defaultValue={e?.corrective_action ?? ""} />
      <div className="grid grid-cols-2 gap-3">
        <SelectField id={`o-${k}`} name="owner_person_id" label="Responsável" defaultValue={e?.owner_person_id ?? ""}>
          <option value="">A definir</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
        </SelectField>
        <TextField id={`p-${k}`} name="due_date" type="date" label="Prazo" defaultValue={e?.due_date ?? ""} />
      </div>
      <SelectField id={`s-${k}`} name="status" label="Situação" defaultValue={e?.status ?? "aberta"}>
        {Object.entries(ERR_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </SelectField>
    </ActionForm>
  );
}
