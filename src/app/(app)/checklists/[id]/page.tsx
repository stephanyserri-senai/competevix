import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/feedback";
import { ActionForm } from "@/components/ui/action-form";
import { TextField } from "@/components/ui/field-errors";
import { RunButton } from "@/components/ui/run-button";
import { hasRole, requireAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime, todayLocal } from "@/lib/dates";
import { completeRun, saveAnswer } from "@/features/checklists/actions";
import { ANSWER_LABEL, completionIssues } from "@/features/checklists/domain";
import { DocumentUploader } from "@/features/documentos/uploader";

export default async function AplicacaoPage({ params }: PageProps<"/checklists/[id]">) {
  const { id } = await params;
  const access = await requireAccess();
  const supabase = await createClient();
  const { data: run } = await supabase.from("checklist_runs").select("*, team:teams(name), template:checklist_templates(name, version)").eq("id", id).maybeSingle();
  if (!run) notFound();
  const [{ data: items }, { data: answers }] = await Promise.all([
    supabase.from("checklist_items").select("*").eq("template_id", run.template_id).order("position"),
    supabase.from("checklist_answers").select("*, evidences:checklist_answer_evidences(document:documents(id, title)), author:profiles!checklist_answers_answered_by_fkey(display_name)").eq("run_id", id),
  ]);
  const byItem = new Map((answers ?? []).map((a) => [a.item_id, a]));
  const canAnswer = run.status === "aberto" && (hasRole(access, run.program_id, "supervisao") || (hasRole(access, run.program_id, "orientador") && Boolean(run.team_id)));
  const issues = completionIssues(
    items ?? [],
    (answers ?? []).map((a) => ({ item_id: a.item_id, value: a.value, evidence_count: a.evidences.length })),
  );
  const overdue = run.status === "aberto" && run.period_end < todayLocal();

  return (
    <>
      <PageHeader
        eyebrow={`Checklist · v${run.template?.version}`}
        title={run.template?.name ?? "Checklist"}
        description={`${run.team?.name ?? "Programa"} · ${formatDate(run.period_start)} a ${formatDate(run.period_end)}`}
        actions={
          <>
            <Link href={`/checklists?programa=${run.program_id}`} className="text-sm text-brand-700 hover:underline">← Checklists</Link>
            {canAnswer ? <RunButton variant="primary" label="Concluir checklist" onRun={completeRun.bind(null, id)} confirm="Concluir? As respostas ficarão imutáveis." /> : null}
          </>
        }
      />
      {run.status === "concluido" ? <Alert tone="success" className="mb-6">Concluído em {formatDateTime(run.completed_at)}. Registro imutável.</Alert> : null}
      {overdue ? <Alert tone="warning" className="mb-6">Período encerrado sem conclusão: aparece como pendente no painel e gera alerta.</Alert> : null}
      {canAnswer && issues.length ? <Alert tone="info" className="mb-6" title="Para concluir:"><ul className="list-disc pl-4">{issues.map((i) => <li key={i}>{i}</li>)}</ul></Alert> : null}

      <ol className="space-y-4">
        {(items ?? []).map((item, n) => {
          const a = byItem.get(item.id);
          return (
            <li key={item.id}>
              <Card as="article">
                <CardHeader
                  title={`${n + 1}. ${item.label}`}
                  description={item.guidance ?? undefined}
                  actions={<span className="flex gap-1">{item.required ? <Badge tone="brand">Obrigatório</Badge> : <Badge>Opcional</Badge>}{item.requires_evidence ? <Badge tone="accent">Exige evidência</Badge> : null}{a ? <Badge tone="success">{ANSWER_LABEL[a.value]}</Badge> : null}</span>}
                />
                <CardBody className="space-y-3">
                  {a ? <p className="text-xs text-slate-600">Respondido por {a.author?.display_name ?? "—"} em {formatDateTime(a.answered_at)}{a.note ? ` — ${a.note}` : ""}</p> : null}
                  {a?.evidences.length ? (
                    <ul className="text-sm">{a.evidences.map((e, i) => e.document ? <li key={i}><a href={`/documentos/${e.document.id}/download`} className="text-brand-700 hover:underline">{e.document.title}</a></li> : null)}</ul>
                  ) : null}
                  {canAnswer ? (
                    <ActionForm action={saveAnswer} schema="checklistAnswer" submitLabel="Salvar resposta" submitVariant="secondary" className="flex flex-wrap items-end gap-4">
                      <input type="hidden" name="run_id" value={id} />
                      <input type="hidden" name="template_id" value={run.template_id} />
                      <input type="hidden" name="item_id" value={item.id} />
                      <input type="hidden" name="program_id" value={run.program_id} />
                      <fieldset className="flex flex-wrap gap-4">
                        <legend className="sr-only">Resposta</legend>
                        {(Object.keys(ANSWER_LABEL) as (keyof typeof ANSWER_LABEL)[]).map((v) => (
                          <label key={v} className="flex items-center gap-1.5 text-sm">
                            <input type="radio" name="value" value={v} defaultChecked={a?.value === v} className="size-4" /> {ANSWER_LABEL[v]}
                          </label>
                        ))}
                      </fieldset>
                      <TextField id={`note-${item.id}`} name="note" label="Observação" defaultValue={a?.note ?? ""} className="min-w-64 flex-1" />
                    </ActionForm>
                  ) : null}
                  {canAnswer && a && item.requires_evidence ? (
                    <details>
                      <summary className="cursor-pointer text-sm font-medium text-brand-700">Anexar evidência</summary>
                      <div className="mt-3"><DocumentUploader programId={run.program_id} teamId={run.team_id} link={{ type: "checklist_answer", id: a.id }} revalidate={`/checklists/${id}`} compact defaultTitle={item.label} /></div>
                    </details>
                  ) : null}
                </CardBody>
              </Card>
            </li>
          );
        })}
      </ol>
    </>
  );
}
