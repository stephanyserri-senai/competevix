import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, FileText } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert, EmptyState } from "@/components/ui/feedback";
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
import { addComment, addDependency, addEvidenceLink, changeActionStatus, removeDependency, saveAction } from "@/features/acoes/actions";
import { PRIORITY_LABEL, STATUS_LABEL, allowedTransitions, completionBlockers, isClosed, type CompletionRule } from "@/features/acoes/domain";
import { DueInfo, PriorityBadge, StatusBadge } from "@/features/acoes/components/badges";
import { DocumentUploader } from "@/features/documentos/uploader";
import { setArchivedAction } from "@/features/acoes/archive";

const HISTORY_LABEL: Record<string, string> = {
  criada: "Criada",
  status: "Status alterado",
  edicao: "Campos alterados",
  comentario: "Comentário",
  evidencia: "Evidência anexada",
  dependencia: "Dependência adicionada",
};
const FIELD_LABEL: Record<string, string> = {
  title: "título", owner_person_id: "responsável", due_date: "prazo", priority: "prioridade", team_id: "equipe",
  requires_evidence: "exigência de evidência", description: "descrição", archived: "arquivamento",
};

export default async function AcaoPage({ params }: PageProps<"/acoes/[id]">) {
  const { id } = await params;
  const access = await requireAccess();
  const supabase = await createClient();
  const { data: a } = await supabase.from("actions_view").select("*").eq("id", id).maybeSingle();
  if (!a || !a.program_id) notFound();

  const [{ data: program }, { data: deps }, { data: evidences }, { data: history }, { data: siblings }, { data: teams }, people, { data: allEdges }] =
    await Promise.all([
      supabase.from("programs").select(PROGRAM_SELECT).eq("id", a.program_id).single(),
      supabase.from("action_dependencies").select("depends_on_id, dep:actions!action_dependencies_dep_fk(id, title, status)").eq("action_id", id),
      supabase.from("action_evidences").select("id, url, note, created_at, document:documents(id, title, original_name), author:profiles!action_evidences_created_by_fkey(display_name)").eq("action_id", id).order("created_at"),
      supabase.from("action_history").select("id, kind, from_status, to_status, note, changes, created_at, actor:profiles!action_history_actor_fkey(display_name)").eq("action_id", id).order("created_at", { ascending: false }),
      supabase.from("actions").select("id, title, status").eq("program_id", a.program_id).is("archived_at", null).neq("id", id).order("title"),
      supabase.from("teams").select("id, name").eq("program_id", a.program_id).is("archived_at", null),
      listPeopleOptions(supabase),
      supabase.from("action_dependencies").select("action_id, depends_on_id").eq("program_id", a.program_id),
    ]);

  const canEdit = hasRole(access, a.program_id, "supervisao") || (hasRole(access, a.program_id, "orientador") && Boolean(a.team_id));
  // Edição final é decidida pelo RLS; aqui só controla exibição.
  const rule = ((program?.settings as { acao_conclusao_exige?: CompletionRule } | null)?.acao_conclusao_exige ?? "nada") as CompletionRule;
  const blockers = completionBlockers({
    rule,
    requiresEvidence: Boolean(a.requires_evidence),
    evidenceCount: a.evidence_count ?? 0,
    note: a.completion_note,
    openDependencies: a.open_dependencies ?? 0,
  });
  const closed = isClosed(a.status!);
  const teamName = (teams ?? []).find((t) => t.id === a.team_id)?.name;
  const owner = people.find((p) => p.id === a.owner_person_id)?.full_name;
  const depIds = new Set((deps ?? []).map((d) => d.depends_on_id));
  // impede oferecer dependências que criariam ciclo (o banco também bloqueia)
  const reachesMe = (start: string) => {
    const stack = [start];
    const seen = new Set<string>();
    while (stack.length) {
      const cur = stack.pop()!;
      if (cur === id) return true;
      if (seen.has(cur)) continue;
      seen.add(cur);
      (allEdges ?? []).filter((e) => e.action_id === cur).forEach((e) => stack.push(e.depends_on_id));
    }
    return false;
  };
  const candidates = (siblings ?? []).filter((s) => !depIds.has(s.id) && !reachesMe(s.id));

  return (
    <>
      <PageHeader
        eyebrow={program ? programLabel(program) : undefined}
        title={a.title}
        description={<span className="flex flex-wrap items-center gap-2"><StatusBadge status={a.status!} /><PriorityBadge priority={a.priority!} /><DueInfo due_date={a.due_date} status={a.status!} /></span>}
        actions={
          <>
            <Link href={`/acoes?programa=${a.program_id}`} className="text-sm text-brand-700 hover:underline">← Voltar às ações</Link>
            {hasRole(access, a.program_id, "supervisao") ? <ArchiveButton archived={Boolean(a.archived_at)} onToggle={setArchivedAction.bind(null, id, !a.archived_at)} /> : null}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Detalhes" />
            <CardBody>
              <dl className="grid gap-3 text-sm sm:grid-cols-3">
                <div><dt className="text-slate-600">Equipe</dt><dd className="font-medium">{teamName ?? "Geral do programa"}</dd></div>
                <div><dt className="text-slate-600">Responsável</dt><dd className="font-medium">{owner ?? "A definir"}</dd></div>
                <div><dt className="text-slate-600">Início</dt><dd className="font-medium">{formatDate(a.start_date)}</dd></div>
                <div><dt className="text-slate-600">Exige evidência</dt><dd className="font-medium">{a.requires_evidence ? "Sim" : "Não"}</dd></div>
                <div><dt className="text-slate-600">Regra do programa</dt><dd className="font-medium">{rule === "nada" ? "Sem exigência" : rule.replaceAll("_", " ")}</dd></div>
                <div><dt className="text-slate-600">Origem</dt><dd className="font-medium">{a.origin ?? "Cadastro manual"}</dd></div>
              </dl>
              {a.description ? <p className="mt-4 whitespace-pre-line text-sm text-slate-800">{a.description}</p> : null}
              {a.status === "bloqueada" && a.blocked_reason ? <Alert tone="warning" className="mt-4" title="Motivo do bloqueio">{a.blocked_reason}</Alert> : null}
              {a.status === "concluida" ? (
                <Alert tone="success" className="mt-4" title={`Concluída em ${formatDateTime(a.completed_at)}`}>{a.completion_note ?? "Sem justificativa registrada."}</Alert>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Evidências" description={`${a.evidence_count ?? 0} registrada(s)`} />
            <CardBody className="space-y-4">
              {(evidences ?? []).length === 0 ? (
                <p className="text-sm text-slate-600">Nenhuma evidência registrada.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {(evidences ?? []).map((e) => (
                    <li key={e.id} className="flex items-start gap-3 py-2 text-sm">
                      {e.document ? <FileText className="mt-0.5 size-4 text-brand-600" aria-hidden /> : <ExternalLink className="mt-0.5 size-4 text-brand-600" aria-hidden />}
                      <div className="min-w-0">
                        {e.document ? (
                          <a href={`/documentos/${e.document.id}/download`} className="font-medium text-brand-700 hover:underline">{e.document.title}</a>
                        ) : e.url ? (
                          <a href={e.url} target="_blank" rel="noopener noreferrer nofollow" className="break-all font-medium text-brand-700 hover:underline">{e.url}</a>
                        ) : (
                          <span className="text-slate-500">Documento indisponível no seu escopo</span>
                        )}
                        {e.note ? <p className="text-slate-700">{e.note}</p> : null}
                        <p className="text-xs text-slate-500">{e.author?.display_name ?? "—"} · {formatDateTime(e.created_at)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {canEdit && !closed ? (
                <div className="grid gap-6 border-t border-slate-100 pt-4 md:grid-cols-2">
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">Anexar arquivo</h3>
                    <DocumentUploader programId={a.program_id} teamId={a.team_id} link={{ type: "action", id }} revalidate={`/acoes/${id}`} />
                  </div>
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">Registrar link</h3>
                    <ActionForm action={addEvidenceLink} schema="evidenceLink" resetOnSuccess submitLabel="Registrar link" submitVariant="secondary">
                      <input type="hidden" name="action_id" value={id} />
                      <input type="hidden" name="program_id" value={a.program_id} />
                      <TextField name="url" type="url" label="Endereço (https://)" required />
                      <TextField name="note" label="Descrição" />
                    </ActionForm>
                  </div>
                </div>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Histórico" description="Registrado automaticamente pelo banco; não editável." />
            <CardBody className="space-y-4">
              {canEdit ? (
                <ActionForm action={addComment} schema="comment" resetOnSuccess submitLabel="Comentar" submitVariant="secondary">
                  <input type="hidden" name="action_id" value={id} />
                  <input type="hidden" name="program_id" value={a.program_id} />
                  <TextareaField name="note" label="Novo comentário" required />
                </ActionForm>
              ) : null}
              <ol className="relative space-y-4 border-l border-slate-200 pl-5">
                {(history ?? []).map((h) => (
                  <li key={h.id} className="text-sm">
                    <span aria-hidden className="absolute -left-1.5 mt-1.5 size-3 rounded-full border-2 border-white bg-brand-500" />
                    <p className="font-medium text-slate-900">
                      {HISTORY_LABEL[h.kind]}
                      {h.kind === "status" && h.from_status && h.to_status ? `: ${STATUS_LABEL[h.from_status]} → ${STATUS_LABEL[h.to_status]}` : ""}
                    </p>
                    {h.kind === "edicao" && h.changes ? (
                      <p className="text-slate-700">Alterado: {Object.keys(h.changes as object).map((k) => FIELD_LABEL[k] ?? k).join(", ")}</p>
                    ) : null}
                    {h.note ? <p className="whitespace-pre-line text-slate-700">{h.note}</p> : null}
                    <p className="text-xs text-slate-500">{h.actor?.display_name ?? "Sistema"} · {formatDateTime(h.created_at)}</p>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          {canEdit ? (
            <Card>
              <CardHeader title="Alterar status" />
              <CardBody>
                {!closed && blockers.length ? (
                  <Alert tone="warning" className="mb-3" title="Para concluir:">
                    <ul className="list-disc pl-4">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>
                  </Alert>
                ) : null}
                <ActionForm action={changeActionStatus} schema="actionStatus" submitLabel="Atualizar status">
                  <input type="hidden" name="id" value={id} />
                  <SelectField name="status" label="Novo status" defaultValue="">
                    <option value="" disabled>Selecione…</option>
                    {allowedTransitions(a.status!).map((s) => <option key={s} value={s}>{s === "aberta" && closed ? "Reabrir" : STATUS_LABEL[s]}</option>)}
                  </SelectField>
                  <TextareaField name="note" label="Justificativa / motivo" hint="Obrigatória para bloquear e reabrir; usada como justificativa de conclusão." />
                </ActionForm>
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Dependências" description="Esta ação depende de:" />
            <CardBody className="space-y-3">
              {(deps ?? []).length === 0 ? <p className="text-sm text-slate-600">Nenhuma dependência.</p> : (
                <ul className="space-y-2">
                  {(deps ?? []).map((d) => (
                    <li key={d.depends_on_id} className="flex items-center justify-between gap-2 text-sm">
                      <span>
                        <Link href={`/acoes/${d.depends_on_id}`} className="text-brand-700 hover:underline">{d.dep?.title ?? "Ação fora do seu escopo"}</Link>
                        {d.dep ? <span className="ml-1"><StatusBadge status={d.dep.status} /></span> : null}
                      </span>
                      {canEdit ? <RunButton label="Remover" onRun={removeDependency.bind(null, id, d.depends_on_id)} confirm="Remover esta dependência?" /> : null}
                    </li>
                  ))}
                </ul>
              )}
              {canEdit && candidates.length > 0 ? (
                <ActionForm action={addDependency} schema="dependency" submitLabel="Adicionar" submitVariant="secondary">
                  <input type="hidden" name="action_id" value={id} />
                  <input type="hidden" name="program_id" value={a.program_id} />
                  <SelectField name="depends_on_id" label="Depende de" defaultValue="">
                    <option value="" disabled>Selecione…</option>
                    {candidates.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                  </SelectField>
                </ActionForm>
              ) : null}
            </CardBody>
          </Card>

          {canEdit && !closed ? (
            <Card>
              <CardHeader title="Editar ação" />
              <CardBody>
                <ActionForm action={saveAction} schema="action">
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="program_id" value={a.program_id} />
                  <TextField name="title" label="Título" defaultValue={a.title ?? ""} required />
                  <SelectField name="team_id" label="Equipe" defaultValue={a.team_id ?? ""}>
                    <option value="">Geral do programa</option>
                    {(teams ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </SelectField>
                  <SelectField name="owner_person_id" label="Responsável" defaultValue={a.owner_person_id ?? ""}>
                    <option value="">A definir</option>
                    {people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                  </SelectField>
                  <div className="grid grid-cols-2 gap-3">
                    <TextField name="start_date" type="date" label="Início" defaultValue={a.start_date ?? ""} />
                    <TextField name="due_date" type="date" label="Prazo" defaultValue={a.due_date ?? ""} />
                  </div>
                  <SelectField name="priority" label="Prioridade" defaultValue={a.priority ?? "media"}>
                    {Object.entries(PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </SelectField>
                  <Checkbox id="edit-req-ev" name="requires_evidence" defaultChecked={Boolean(a.requires_evidence)} label="Exigir evidência para concluir" />
                  <TextareaField name="description" label="Descrição" defaultValue={a.description ?? ""} />
                </ActionForm>
              </CardBody>
            </Card>
          ) : null}
          {!canEdit ? <EmptyState title="Somente leitura">Seu papel permite consultar esta ação.</EmptyState> : null}
        </div>
      </div>
    </>
  );
}
