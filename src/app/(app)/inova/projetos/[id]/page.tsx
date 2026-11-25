import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, FileText } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/feedback";
import { ActionForm } from "@/components/ui/action-form";
import { SelectField, TextField, TextareaField } from "@/components/ui/field-errors";
import { ArchiveButton } from "@/components/ui/archive-button";
import { hasRole, requireAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime } from "@/lib/dates";
import { addProjectEvidence, advanceStage, saveProject, setProjectArchived } from "@/features/inova/actions";
import { EVIDENCE_LABEL, STAGES, STAGE_LABEL, nextStage, type Stage } from "@/features/inova/domain";
import { DocumentUploader } from "@/features/documentos/uploader";
import { cn } from "@/lib/cn";

export default async function ProjetoPage({ params }: PageProps<"/inova/projetos/[id]">) {
  const { id } = await params;
  const access = await requireAccess();
  const supabase = await createClient();
  const { data: p } = await supabase.from("projects").select("*, team:teams(name)").eq("id", id).maybeSingle();
  if (!p) notFound();
  const [{ data: evidences }, { data: history }, { data: panels }] = await Promise.all([
    supabase.from("project_evidences").select("id, stage, kind, description, url, created_at, document:documents(id, title), author:profiles!project_evidences_created_by_fkey(display_name)").eq("project_id", id).order("created_at", { ascending: false }),
    supabase.from("project_stage_history").select("id, from_stage, to_stage, note, evidence_count, created_at, reviewer:profiles!project_stage_history_reviewer_fkey(display_name)").eq("project_id", id).order("created_at", { ascending: false }),
    supabase.from("panels").select("id, title, held_on, status, version").eq("project_id", id).order("held_on", { ascending: false }),
  ]);
  const isSup = hasRole(access, p.program_id, "supervisao");
  const canEdit = isSup || hasRole(access, p.program_id, "orientador");
  const stage = p.stage as Stage;
  const next = nextStage(stage);
  const evCurrent = (evidences ?? []).filter((e) => e.stage === stage).length;
  const idx = STAGES.indexOf(stage);
  const hasPublishedPanel = (panels ?? []).some((x) => x.status === "publicada");

  return (
    <>
      <PageHeader
        eyebrow={`Projeto INOVA · ${p.team?.name}`}
        title={p.title}
        description={`Etapa: ${STAGE_LABEL[stage]} desde ${formatDate(p.stage_changed_at.slice(0, 10))}${p.partner_company ? ` · Empresa: ${p.partner_company}` : ""}`}
        actions={
          <>
            <Link href={`/inova?programa=${p.program_id}`} className="text-sm text-brand-700 hover:underline">← Funil</Link>
            {isSup ? <ArchiveButton archived={Boolean(p.archived_at)} onToggle={setProjectArchived.bind(null, id, !p.archived_at)} /> : null}
          </>
        }
      />
      <ol className="mb-6 flex flex-wrap gap-1" aria-label="Etapas do funil">
        {STAGES.map((s, i) => (
          <li key={s} aria-current={s === stage ? "step" : undefined}
            className={cn("rounded-full px-3 py-1 text-xs", i < idx ? "bg-brand-100 text-brand-800" : s === stage ? "bg-brand-700 font-semibold text-white" : "bg-slate-100 text-slate-500")}>
            {i + 1}. {STAGE_LABEL[s]}
          </li>
        ))}
      </ol>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Evidências" description={`${evCurrent} na etapa atual · avançar exige ao menos uma evidência da etapa atual`} />
            <CardBody className="space-y-4">
              {(evidences ?? []).length === 0 ? <p className="text-sm text-slate-600">Nenhuma evidência registrada.</p> : (
                <ul className="divide-y divide-slate-100">
                  {(evidences ?? []).map((e) => (
                    <li key={e.id} className="flex gap-3 py-2 text-sm">
                      {e.document ? <FileText className="mt-0.5 size-4 text-brand-600" aria-hidden /> : <ExternalLink className="mt-0.5 size-4 text-brand-600" aria-hidden />}
                      <div className="min-w-0">
                        <p><Badge>{STAGE_LABEL[e.stage as Stage]}</Badge> <strong>{EVIDENCE_LABEL[e.kind]}</strong></p>
                        <p className="whitespace-pre-line text-slate-700">{e.description}</p>
                        {e.document ? <a href={`/documentos/${e.document.id}/download`} className="text-brand-700 hover:underline">{e.document.title}</a> : null}
                        {e.url ? <a href={e.url} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-brand-700 hover:underline">{e.url}</a> : null}
                        <p className="text-xs text-slate-500">{e.author?.display_name ?? "—"} · {formatDateTime(e.created_at)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {canEdit && !p.archived_at ? (
                <div className="grid gap-6 border-t border-slate-100 pt-4 md:grid-cols-2">
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">Registrar evidência (texto ou link)</h3>
                    <ActionForm action={addProjectEvidence} schema="projectEvidence" resetOnSuccess submitLabel="Registrar" submitVariant="secondary">
                      <input type="hidden" name="project_id" value={id} />
                      <input type="hidden" name="program_id" value={p.program_id} />
                      <SelectField name="kind" label="Tipo" defaultValue="comparacao_mercado">
                        {Object.entries(EVIDENCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </SelectField>
                      <TextareaField name="description" label="Descrição" required hint="Fatos verificáveis; não registrar ganhos fictícios (PRD §7)." />
                      <TextField name="url" type="url" label="Link (https://, opcional)" />
                    </ActionForm>
                  </div>
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">Anexar documento como evidência</h3>
                    <DocumentUploader programId={p.program_id} teamId={p.team_id} link={{ type: "project", id, kind: "outro", description: "" }} revalidate={`/inova/projetos/${id}`} evidenceKinds={EVIDENCE_LABEL} />
                  </div>
                </div>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Ficha do projeto" />
            <CardBody>
              {canEdit ? (
                <ActionForm action={saveProject} schema="project">
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="program_id" value={p.program_id} />
                  <input type="hidden" name="team_id" value={p.team_id} />
                  <TextField name="title" label="Título" defaultValue={p.title} required />
                  <TextField name="partner_company" label="Empresa parceira" defaultValue={p.partner_company ?? ""} />
                  <TextareaField name="problem" label="Problema" defaultValue={p.problem ?? ""} />
                  <TextareaField name="solution" label="Solução" defaultValue={p.solution ?? ""} />
                  <TextareaField name="differential" label="Diferencial técnico" defaultValue={p.differential ?? ""} />
                  <TextareaField name="value_proposition" label="Proposta de valor" defaultValue={p.value_proposition ?? ""} />
                  <TextareaField name="business_model" label="Modelo de negócio" defaultValue={p.business_model ?? ""} />
                </ActionForm>
              ) : (
                <dl className="space-y-3 text-sm">
                  {[["Problema", p.problem], ["Solução", p.solution], ["Diferencial", p.differential], ["Proposta de valor", p.value_proposition], ["Modelo de negócio", p.business_model]].map(([l, v]) => (
                    <div key={l}><dt className="font-semibold">{l}</dt><dd className="whitespace-pre-line text-slate-700">{v || "—"}</dd></div>
                  ))}
                </dl>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          {isSup && !p.archived_at ? (
            <Card>
              <CardHeader title="Revisão de etapa (supervisão)" />
              <CardBody className="space-y-3">
                {next && evCurrent === 0 ? <Alert tone="warning">Registre ao menos uma evidência em “{STAGE_LABEL[stage]}” para avançar.</Alert> : null}
                {next === "prioritario" && !hasPublishedPanel ? <Alert tone="warning">Priorizar exige banca publicada.</Alert> : null}
                <ActionForm action={advanceStage} schema="advance" submitLabel="Registrar decisão">
                  <input type="hidden" name="project_id" value={id} />
                  <SelectField name="to_stage" label="Mover para" defaultValue={next ?? ""}>
                    {next ? <option value={next}>Avançar → {STAGE_LABEL[next]}</option> : null}
                    {STAGES.slice(0, idx).map((s) => <option key={s} value={s}>Retornar → {STAGE_LABEL[s]}</option>)}
                  </SelectField>
                  <TextareaField name="note" label="Parecer / justificativa" hint="Obrigatória para retornar." />
                </ActionForm>
              </CardBody>
            </Card>
          ) : null}
          <Card>
            <CardHeader title="Bancas" />
            <CardBody>
              {(panels ?? []).length === 0 ? <p className="text-sm text-slate-600">Nenhuma banca.</p> : (
                <ul className="space-y-1 text-sm">{(panels ?? []).map((x) => (
                  <li key={x.id}><Link href={`/inova/bancas/${x.id}`} className="text-brand-700 hover:underline">{x.title}</Link> <span className="text-xs text-slate-500">{formatDate(x.held_on)} · {x.status}{x.version > 1 ? ` · v${x.version}` : ""}</span></li>
                ))}</ul>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Histórico de etapas" description="Gravado pelo banco; não editável." />
            <CardBody>
              {(history ?? []).length === 0 ? <p className="text-sm text-slate-600">Sem movimentações.</p> : (
                <ol className="space-y-3 text-sm">{(history ?? []).map((h) => (
                  <li key={h.id}>
                    <p className="font-medium">{STAGE_LABEL[h.from_stage as Stage]} → {STAGE_LABEL[h.to_stage as Stage]}</p>
                    {h.note ? <p className="text-slate-700">{h.note}</p> : null}
                    <p className="text-xs text-slate-500">{h.reviewer?.display_name ?? "—"} · {formatDateTime(h.created_at)} · {h.evidence_count} evidência(s) na etapa</p>
                  </li>
                ))}</ol>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
