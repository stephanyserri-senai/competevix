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
import { addPlanItem, newPlanVersion, publishPlan, removePlanItem, setItemStatus } from "@/features/worldskills/actions";
import { ITEM_STATUS_LABEL, PLAN_STATUS_LABEL, formatMinutes } from "@/features/worldskills/domain";

export default async function PlanoPage({ params }: PageProps<"/worldskills/planos/[id]">) {
  const { id } = await params;
  const access = await requireAccess();
  const supabase = await createClient();
  const { data: plan } = await supabase.from("training_plans").select("*, team:teams(name, occupation_id)").eq("id", id).maybeSingle();
  if (!plan) notFound();
  const [{ data: items }, { data: family }, { data: competencies }, people] = await Promise.all([
    supabase.from("training_items").select("*, competency:competencies(name), responsible:people(full_name)").eq("plan_id", id).order("due_date"),
    supabase.from("training_plans").select("id, version, status").eq("family_id", plan.family_id).order("version"),
    supabase.from("competencies").select("id, name, occupation_id").eq("program_id", plan.program_id).is("archived_at", null).order("name"),
    listPeopleOptions(supabase),
  ]);
  const canEdit = hasRole(access, plan.program_id, "supervisao") || hasRole(access, plan.program_id, "orientador");
  const draft = plan.status === "rascunho";
  const comps = (competencies ?? []).filter((c) => !plan.team?.occupation_id || c.occupation_id === plan.team.occupation_id);
  const total = (items ?? []).filter((i) => i.status !== "cancelado").reduce((s, i) => s + i.planned_minutes, 0);

  return (
    <>
      <PageHeader
        eyebrow={`Plano de treinamento · ${plan.team?.name} · v${plan.version}`}
        title={plan.title}
        description={`${formatDate(plan.period_start)} a ${formatDate(plan.period_end)} · ${PLAN_STATUS_LABEL[plan.status]}${plan.published_at ? ` em ${formatDateTime(plan.published_at)}` : ""} · ${formatMinutes(total)} previstas`}
        actions={
          <>
            <Link href={`/worldskills?programa=${plan.program_id}&aba=planos`} className="text-sm text-brand-700 hover:underline">← Planos</Link>
            {canEdit && draft ? <RunButton variant="primary" label="Publicar" onRun={publishPlan.bind(null, id)} confirm="Publicar? O conteúdo fica imutável; versões anteriores são substituídas." /> : null}
          </>
        }
      />
      {plan.change_note ? <Alert tone="info" className="mb-4" title="Motivo desta versão">{plan.change_note}</Alert> : null}
      {plan.status === "substituido" ? <Alert tone="warning" className="mb-4">Versão substituída: mantida apenas como histórico.</Alert> : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {(items ?? []).length === 0 ? <EmptyState title="Plano sem itens">Inclua competência, objetivo, atividade, horas, responsável, recurso, evidência e critério de aceite.</EmptyState> : (
            <Table caption="Itens do plano">
              <thead><tr><Th>Item</Th><Th>Prazo</Th><Th className="text-right">Horas</Th><Th>Execução</Th></tr></thead>
              <tbody>
                {(items ?? []).map((i) => (
                  <Tr key={i.id}>
                    <Td className="max-w-md">
                      <p className="font-medium">{i.objective}</p>
                      <p className="text-xs text-slate-600">{i.competency?.name ?? "Sem competência"} · {i.activity}</p>
                      <p className="text-xs text-slate-500">
                        {i.responsible?.full_name ? `Resp.: ${i.responsible.full_name} · ` : ""}{i.resource ? `Recurso: ${i.resource} · ` : ""}{i.expected_evidence ? `Evidência: ${i.expected_evidence} · ` : ""}{i.acceptance_criteria ? `Aceite: ${i.acceptance_criteria}` : ""}
                      </p>
                      {i.status_note ? <p className="text-xs text-amber-800">{i.status_note}</p> : null}
                    </Td>
                    <Td className="whitespace-nowrap text-xs">{formatDate(i.due_date)}</Td>
                    <Td className="text-right">{formatMinutes(i.planned_minutes)}</Td>
                    <Td>
                      <Badge tone={i.status === "concluido" ? "success" : i.status === "cancelado" ? "neutral" : "info"}>{ITEM_STATUS_LABEL[i.status]}</Badge>
                      {canEdit && draft ? <div className="mt-1"><RunButton label="Remover" onRun={removePlanItem.bind(null, id, i.id)} /></div> : null}
                      {canEdit && plan.status === "publicado" ? (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-xs text-brand-700">Registrar</summary>
                          <ActionForm action={setItemStatus} schema="itemStatus" submitLabel="Salvar" submitVariant="secondary" className="mt-2 space-y-2">
                            <input type="hidden" name="id" value={i.id} />
                            <input type="hidden" name="plan_id" value={id} />
                            <SelectField id={`st-${i.id}`} name="status" label="Situação" defaultValue={i.status}>
                              {Object.entries(ITEM_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </SelectField>
                            <TextField id={`nt-${i.id}`} name="status_note" label="Justificativa" hint="Obrigatória para cancelar." />
                          </ActionForm>
                        </details>
                      ) : null}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
        <div className="space-y-6">
          {canEdit && draft ? (
            <Card>
              <CardHeader title="Novo item" />
              <CardBody>
                <ActionForm action={addPlanItem} schema="trainingItem" resetOnSuccess submitLabel="Incluir item">
                  <input type="hidden" name="plan_id" value={id} />
                  <input type="hidden" name="program_id" value={plan.program_id} />
                  <SelectField name="competency_id" label="Competência" defaultValue="">
                    <option value="">—</option>
                    {comps.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </SelectField>
                  <TextField name="objective" label="Objetivo" required />
                  <TextareaField name="activity" label="Atividade" required />
                  <div className="grid grid-cols-2 gap-3">
                    <TextField name="planned_minutes" type="number" min={1} label="Previsto (min)" required />
                    <TextField name="due_date" type="date" label="Prazo" defaultValue={plan.period_end} required />
                  </div>
                  <SelectField name="responsible_person_id" label="Responsável" defaultValue="">
                    <option value="">A definir</option>
                    {people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                  </SelectField>
                  <TextField name="resource" label="Recurso" />
                  <TextField name="expected_evidence" label="Evidência esperada" />
                  <TextareaField name="acceptance_criteria" label="Critério de aceite" />
                </ActionForm>
              </CardBody>
            </Card>
          ) : null}
          {canEdit && plan.status === "publicado" ? (
            <Card>
              <CardHeader title="Alterar o plano" description="Cria nova versão em rascunho com os itens não cancelados." />
              <CardBody>
                <ActionForm action={newPlanVersion} schema="planVersion" submitLabel="Criar nova versão" submitVariant="secondary">
                  <input type="hidden" name="id" value={id} />
                  <TextareaField name="note" label="Motivo da alteração" required />
                </ActionForm>
              </CardBody>
            </Card>
          ) : null}
          <Card>
            <CardHeader title="Versões" />
            <CardBody>
              <ul className="space-y-1 text-sm">
                {(family ?? []).map((f) => (
                  <li key={f.id}><Link href={`/worldskills/planos/${f.id}`} className={f.id === id ? "font-semibold" : "text-brand-700 hover:underline"}>v{f.version}</Link> — {PLAN_STATUS_LABEL[f.status]}</li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
