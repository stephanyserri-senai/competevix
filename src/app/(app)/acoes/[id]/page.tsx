import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, Check, ExternalLink, FileText } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActionForm } from "@/components/ui/action-form";
import { SelectField, TextField, TextareaField } from "@/components/ui/field-errors";
import { Checkbox } from "@/components/ui/field";
import { RunButton } from "@/components/ui/run-button";
import { ArchiveButton } from "@/components/ui/archive-button";
import { hasRole, requireAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime } from "@/lib/dates";
import { programLabel, PROGRAM_SELECT } from "@/features/programas/queries";
import { listPeopleOptions } from "@/features/equipes/queries";
import { addComment, addDependency, addEvidenceLink, removeDependency, saveAction } from "@/features/acoes/actions";
import { PRIORITY_LABEL, STATUS_LABEL, completionBlockers, dueLabel, type CompletionRule } from "@/features/acoes/domain";
import { BOARD_STAGES, STAGE_LABEL, THEME_LABEL, type Stage, type Theme } from "@/features/bi/domain";
import { ActionControls } from "@/features/acoes/components/action-controls";
import { DocumentUploader } from "@/features/documentos/uploader";
import { setArchivedAction } from "@/features/acoes/archive";
import { cn } from "@/lib/cn";

const FIELD_LABEL: Record<string, string> = {
  title: "título", owner_person_id: "responsável", due_date: "prazo", priority: "prioridade", team_id: "equipe",
  requires_evidence: "exigência de evidência", description: "descrição", archived: "arquivamento", theme: "tema",
};

function historyText(h: { kind: string; from_status: string | null; to_status: string | null; changes: unknown }) {
  const ch = (h.changes ?? {}) as Record<string, unknown>;
  if (h.kind === "criada") return "Ação criada";
  if (h.kind === "status" && h.to_status) {
    const to = h.to_status === "aberta" ? "A fazer" : STATUS_LABEL[h.to_status as keyof typeof STATUS_LABEL];
    return h.to_status === "concluida" ? "Aprovada e concluída" : `Movida para ${to}`;
  }
  if (ch.etapa === "enviada_validacao") return "Enviada para validação";
  if (ch.etapa === "devolvida") return "Devolvida para ajustes";
  if (ch.bloqueio === "bloqueada") return "Sinalizada como bloqueada";
  if (ch.bloqueio === "desbloqueada") return "Bloqueio removido";
  if (h.kind === "comentario") return "Comentário";
  if (h.kind === "evidencia") return "Evidência anexada";
  if (h.kind === "dependencia") return "Dependência adicionada";
  return `Alterado: ${Object.keys(ch).map((k) => FIELD_LABEL[k] ?? k).join(", ")}`;
}

export default async function AcaoPage({ params }: PageProps<"/acoes/[id]">) {
  const { id } = await params;
  const access = await requireAccess();
  const supabase = await createClient();
  const { data: a } = await supabase.from("actions_view").select("*").eq("id", id).maybeSingle();
  if (!a || !a.program_id) notFound();

  const [{ data: program }, { data: deps }, { data: evidences }, { data: history }, { data: siblings }, { data: teams }, people] = await Promise.all([
    supabase.from("programs").select(PROGRAM_SELECT).eq("id", a.program_id).single(),
    supabase.from("action_dependencies").select("depends_on_id, dep:actions!action_dependencies_dep_fk(id, title, status)").eq("action_id", id),
    supabase.from("action_evidences").select("id, url, note, created_at, document:documents(id, title), author:profiles!action_evidences_created_by_fkey(display_name)").eq("action_id", id).order("created_at"),
    supabase.from("action_history").select("id, kind, from_status, to_status, note, changes, created_at, actor:profiles!action_history_actor_fkey(display_name)").eq("action_id", id).order("created_at", { ascending: false }),
    supabase.from("actions").select("id, title").eq("program_id", a.program_id).is("archived_at", null).neq("id", id).not("status", "in", "(concluida,cancelada)").order("title"),
    supabase.from("teams").select("id, name").eq("program_id", a.program_id).is("archived_at", null),
    listPeopleOptions(supabase),
  ]);

  const stage = a.stage as Stage;
  const isSup = hasRole(access, a.program_id, "supervisao");
  const canEdit = isSup || (hasRole(access, a.program_id, "orientador") && Boolean(a.team_id));
  const closed = stage === "concluida" || stage === "cancelada";
  const rule = ((program?.settings as { acao_conclusao_exige?: CompletionRule } | null)?.acao_conclusao_exige ?? "nada") as CompletionRule;
  const blockers = completionBlockers({ rule, requiresEvidence: Boolean(a.requires_evidence), evidenceCount: a.evidence_count ?? 0, note: a.completion_note, openDependencies: a.open_dependencies ?? 0 });
  const owner = people.find((p) => p.id === a.owner_person_id)?.full_name;
  const team = (teams ?? []).find((t) => t.id === a.team_id)?.name;
  const due = a.due_date ? dueLabel({ due_date: a.due_date, status: a.status! }) : null;
  const stepIndex = BOARD_STAGES.indexOf(stage);

  return (
    <>
      <Link href="/acoes" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-700"><ArrowLeft className="size-4" aria-hidden /> Ações</Link>

      <Card className="mb-6">
        <CardBody className="space-y-5 pt-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap gap-1.5">
                <Badge tone="brand">{program ? programLabel(program) : ""}</Badge>
                {a.theme ? <Badge>{THEME_LABEL[a.theme as Theme]}</Badge> : null}
                {stage === "cancelada" ? <Badge>Cancelada</Badge> : null}
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">{a.title}</h1>
            </div>
            {isSup ? <ArchiveButton archived={Boolean(a.archived_at)} onToggle={setArchivedAction.bind(null, id, !a.archived_at)} /> : null}
          </div>

          {/* Workflow */}
          <ol className="grid grid-cols-4 gap-2" aria-label="Etapas do workflow">
            {BOARD_STAGES.map((s, i) => (
              <li key={s} aria-current={s === stage ? "step" : undefined} className="space-y-1.5">
                <div className={cn("h-1.5 rounded-full", stage === "cancelada" ? "bg-slate-200" : i <= stepIndex ? (s === "concluida" ? "bg-emerald-500" : "bg-brand-600") : "bg-slate-200")} />
                <p className={cn("flex items-center gap-1 text-xs", s === stage ? "font-semibold text-slate-900" : "text-slate-500")}>
                  {i < stepIndex && stage !== "cancelada" ? <Check className="size-3 text-emerald-600" aria-hidden /> : null}{STAGE_LABEL[s]}
                </p>
              </li>
            ))}
          </ol>

          {a.blocked ? (
            <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> <span><strong>Bloqueada:</strong> {a.blocked_reason}</span></p>
          ) : null}
          {!closed && blockers.length && stage !== "em_validacao" ? (
            <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">Antes de enviar para validação: {blockers.join(" ")}</p>
          ) : null}
          {stage === "concluida" ? <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900">Concluída em {formatDateTime(a.completed_at)}{a.completion_note ? ` — ${a.completion_note}` : ""}</p> : null}

          <ActionControls id={id} title={a.title ?? ""} stage={stage} blocked={Boolean(a.blocked)} isSupervisor={isSup} canMove={canEdit} />

          <dl className="grid gap-4 border-t border-slate-100 pt-4 text-sm sm:grid-cols-4">
            <div><dt className="text-xs uppercase tracking-wide text-slate-400">Responsável</dt><dd className="mt-0.5 font-medium text-slate-800">{owner ?? "A definir"}</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-slate-400">Prazo</dt><dd className={cn("mt-0.5 font-medium", a.is_overdue ? "text-red-700" : "text-slate-800")}>{a.due_date ? `${formatDate(a.due_date)}${due ? ` · ${due}` : ""}` : "Sem prazo"}</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-slate-400">Equipe</dt><dd className="mt-0.5 font-medium text-slate-800">{team ?? "Geral da frente"}</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-slate-400">Prioridade</dt><dd className="mt-0.5 font-medium text-slate-800">{PRIORITY_LABEL[a.priority!]}</dd></div>
          </dl>
          {a.description ? <p className="whitespace-pre-line text-sm text-slate-700">{a.description}</p> : null}
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Evidências" description={a.requires_evidence || rule === "evidencia" ? "Obrigatória para concluir." : "Fotos, documentos ou links do que foi feito."} />
            <CardBody className="space-y-4">
              {(evidences ?? []).length === 0 ? <p className="text-sm text-slate-500">Nenhuma evidência ainda.</p> : (
                <ul className="space-y-2">
                  {(evidences ?? []).map((e) => (
                    <li key={e.id} className="flex items-start gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm">
                      {e.document ? <FileText className="mt-0.5 size-4 text-brand-600" aria-hidden /> : <ExternalLink className="mt-0.5 size-4 text-brand-600" aria-hidden />}
                      <div className="min-w-0">
                        {e.document ? <a href={`/documentos/${e.document.id}/download`} className="font-medium text-brand-700 hover:underline">{e.document.title}</a>
                          : e.url ? <a href={e.url} target="_blank" rel="noopener noreferrer nofollow" className="break-all font-medium text-brand-700 hover:underline">{e.url}</a> : null}
                        {e.note ? <p className="text-slate-600">{e.note}</p> : null}
                        <p className="text-xs text-slate-400">{e.author?.display_name ?? "—"} · {formatDateTime(e.created_at)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {canEdit && !closed ? (
                <details className="rounded-xl border border-slate-200 p-3">
                  <summary className="cursor-pointer text-sm font-medium text-brand-700">+ Adicionar evidência</summary>
                  <div className="mt-3 grid gap-6 md:grid-cols-2">
                    <DocumentUploader programId={a.program_id} teamId={a.team_id} link={{ type: "action", id }} revalidate={`/acoes/${id}`} />
                    <ActionForm action={addEvidenceLink} schema="evidenceLink" resetOnSuccess submitLabel="Registrar link" submitVariant="secondary">
                      <input type="hidden" name="action_id" value={id} />
                      <input type="hidden" name="program_id" value={a.program_id} />
                      <TextField name="url" type="url" label="Link (https://)" required />
                      <TextField name="note" label="Descrição" />
                    </ActionForm>
                  </div>
                </details>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Histórico" />
            <CardBody className="space-y-4">
              {canEdit ? (
                <ActionForm action={addComment} schema="comment" resetOnSuccess submitLabel="Comentar" submitVariant="secondary" className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="action_id" value={id} />
                  <input type="hidden" name="program_id" value={a.program_id} />
                  <TextField name="note" label={<span className="sr-only">Comentário</span>} placeholder="Escreva um comentário…" className="min-w-64 flex-1" />
                </ActionForm>
              ) : null}
              <ol className="relative space-y-4 border-l-2 border-slate-100 pl-5">
                {(history ?? []).map((h) => (
                  <li key={h.id} className="text-sm">
                    <span aria-hidden className="absolute -left-[7px] mt-1.5 size-3 rounded-full border-2 border-white bg-brand-500" />
                    <p className="font-medium text-slate-800">{historyText(h)}</p>
                    {h.note ? <p className="whitespace-pre-line text-slate-600">{h.note}</p> : null}
                    <p className="text-xs text-slate-400">{h.actor?.display_name ?? "Sistema"} · {formatDateTime(h.created_at)}</p>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-4">
          {canEdit && !closed ? (
            <details className="rounded-2xl border border-slate-200/80 bg-white p-4">
              <summary className="cursor-pointer text-sm font-semibold text-slate-800">Editar ação</summary>
              <div className="mt-3">
                <ActionForm action={saveAction} schema="action">
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="program_id" value={a.program_id} />
                  <TextField name="title" label="Título" defaultValue={a.title ?? ""} required />
                  <SelectField name="owner_person_id" label="Responsável" defaultValue={a.owner_person_id ?? ""}>
                    <option value="">A definir</option>
                    {people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                  </SelectField>
                  <div className="grid grid-cols-2 gap-3">
                    <TextField name="due_date" type="date" label="Prazo" defaultValue={a.due_date ?? ""} />
                    <SelectField name="theme" label="Tema" defaultValue={a.theme ?? ""}>
                      <option value="">—</option>
                      {Object.entries(THEME_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </SelectField>
                    <SelectField name="team_id" label="Equipe" defaultValue={a.team_id ?? ""}>
                      <option value="">Geral da frente</option>
                      {(teams ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </SelectField>
                    <SelectField name="priority" label="Prioridade" defaultValue={a.priority ?? "media"}>
                      {Object.entries(PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </SelectField>
                  </div>
                  <TextField name="start_date" type="date" label="Início (opcional)" defaultValue={a.start_date ?? ""} />
                  <Checkbox id="edit-req-ev" name="requires_evidence" defaultChecked={Boolean(a.requires_evidence)} label="Exigir evidência para concluir" />
                  <TextareaField name="description" label="Descrição" defaultValue={a.description ?? ""} />
                </ActionForm>
              </div>
            </details>
          ) : null}

          <details className="rounded-2xl border border-slate-200/80 bg-white p-4" open={(deps ?? []).length > 0}>
            <summary className="cursor-pointer text-sm font-semibold text-slate-800">Depende de outras ações ({(deps ?? []).length})</summary>
            <div className="mt-3 space-y-3">
              {(deps ?? []).length === 0 ? <p className="text-sm text-slate-500">Nenhuma.</p> : (
                <ul className="space-y-1.5">
                  {(deps ?? []).map((d) => (
                    <li key={d.depends_on_id} className="flex items-center justify-between gap-2 text-sm">
                      <Link href={`/acoes/${d.depends_on_id}`} className="text-brand-700 hover:underline">{d.dep?.title ?? "Ação fora do seu escopo"}</Link>
                      {canEdit ? <RunButton label="Remover" onRun={removeDependency.bind(null, id, d.depends_on_id)} /> : null}
                    </li>
                  ))}
                </ul>
              )}
              {canEdit && (siblings ?? []).length ? (
                <ActionForm action={addDependency} schema="dependency" submitLabel="Adicionar" submitVariant="secondary">
                  <input type="hidden" name="action_id" value={id} />
                  <input type="hidden" name="program_id" value={a.program_id} />
                  <SelectField name="depends_on_id" label="Só pode concluir depois de" defaultValue="">
                    <option value="" disabled>Selecione…</option>
                    {(siblings ?? []).map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                  </SelectField>
                </ActionForm>
              ) : null}
            </div>
          </details>
          {a.origin ? <p className="px-1 text-xs text-slate-400">Origem: {a.origin}</p> : null}
        </div>
      </div>
    </>
  );
}
