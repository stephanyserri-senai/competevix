import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { ActionForm } from "@/components/ui/action-form";
import { SelectField, TextField, TextareaField } from "@/components/ui/field-errors";
import { ArchiveButton } from "@/components/ui/archive-button";
import { ButtonLink } from "@/components/ui/button";
import { hasRole, requireAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/dates";
import { PROGRAM_SELECT, programLabel } from "@/features/programas/queries";
import { saveOccupation, saveStage, setArchived, updateProgramSettings } from "@/features/programas/actions";
import { PROGRAM_STATUS_LABEL } from "@/features/labels";
import { COMPLETION_RULE_LABEL, type CompletionRule } from "@/features/acoes/domain";
import type { Tables } from "@/lib/database.types";

export default async function ProgramaPage({ params }: PageProps<"/competicoes/[id]">) {
  const { id } = await params;
  const access = await requireAccess();
  const supabase = await createClient();
  const { data: program } = await supabase.from("programs").select(PROGRAM_SELECT).eq("id", id).maybeSingle();
  if (!program) notFound();

  const [{ data: stages }, { data: occupations }, { count: teamCount }] = await Promise.all([
    supabase.from("stages").select("*").eq("program_id", id).order("position"),
    supabase.from("occupations").select("*").eq("program_id", id).order("code"),
    supabase.from("teams").select("id", { count: "exact", head: true }).eq("program_id", id).is("archived_at", null),
  ]);
  const canManage = hasRole(access, id, "supervisao");
  const canSettings = canManage || access.isAdmin;
  const settings = (program.settings ?? {}) as { acao_conclusao_exige?: CompletionRule };
  const path = `/competicoes/${id}`;

  return (
    <>
      <PageHeader
        eyebrow={program.competition?.name}
        title={programLabel(program)}
        description={`Status: ${PROGRAM_STATUS_LABEL[program.status]}${program.archived_at ? " · arquivado" : ""}`}
        actions={
          <>
            <ButtonLink href={`/equipes?programa=${id}`}>Equipes ({teamCount ?? 0})</ButtonLink>
            <ButtonLink href={`/acoes?programa=${id}`}>Ações</ButtonLink>
            <ButtonLink href={`/agenda?programa=${id}`}>Agenda</ButtonLink>
          </>
        }
      />
      {program.competition?.kind === "inova" ? (
        <Alert tone="info" className="mb-6" title="Projetos INOVA">
          Ficha de projeto, funil com evidências, rubricas e bancas versionadas fazem parte da etapa 3 (RF08). Nesta etapa, use equipes, ações, agenda e documentos do programa.
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Etapas" description="Seletivas, etapas estaduais/nacionais, bancas…" />
            <CardBody className="space-y-3">
              {(stages ?? []).length === 0 ? (
                <EmptyState title="Nenhuma etapa cadastrada">O calendário oficial ainda depende de confirmação (PRD §14).</EmptyState>
              ) : (
                <ol className="divide-y divide-slate-100">
                  {(stages ?? []).map((s) => (
                    <li key={s.id} className="py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-medium text-slate-900">{s.position + 1}. {s.name} {s.archived_at ? <Badge>Arquivada</Badge> : null}</p>
                          <p className="text-xs text-slate-600">
                            {s.start_date || s.end_date ? `${formatDate(s.start_date)} a ${formatDate(s.end_date)}` : "Datas a definir"}
                            {s.location ? ` · ${s.location}` : ""}
                          </p>
                        </div>
                        {canManage ? <ArchiveButton archived={Boolean(s.archived_at)} onToggle={setArchived.bind(null, "stages", s.id, !s.archived_at, path)} /> : null}
                      </div>
                      {canManage ? (
                        <details className="mt-2"><summary className="cursor-pointer text-sm text-brand-700">Editar</summary><div className="mt-3"><StageForm programId={id} s={s} /></div></details>
                      ) : null}
                    </li>
                  ))}
                </ol>
              )}
              {canManage ? (
                <details><summary className="cursor-pointer text-sm font-medium text-brand-700">+ Nova etapa</summary><div className="mt-3"><StageForm programId={id} nextPosition={(stages ?? []).length} /></div></details>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Ocupações / categorias" description="Metas exigem fonte declarada. Não há conversão de escala nesta etapa." />
            <CardBody className="space-y-3">
              {(occupations ?? []).length === 0 ? (
                <EmptyState title="Nenhuma ocupação cadastrada" />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {(occupations ?? []).map((o) => (
                    <li key={o.id} className="py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-medium text-slate-900">{o.code} — {o.name} {o.archived_at ? <Badge>Arquivada</Badge> : null}</p>
                          <p className="text-xs text-slate-600">
                            Meta: {o.target_score !== null ? <strong>{Number(o.target_score).toLocaleString("pt-BR")}</strong> : "sem meta registrada"}
                            {o.target_source ? <> · <span title="Origem da meta">Fonte: {o.target_source}</span></> : null}
                          </p>
                        </div>
                        {canManage ? <ArchiveButton archived={Boolean(o.archived_at)} onToggle={setArchived.bind(null, "occupations", o.id, !o.archived_at, path)} /> : null}
                      </div>
                      {canManage ? (
                        <details className="mt-2"><summary className="cursor-pointer text-sm text-brand-700">Editar</summary><div className="mt-3"><OccupationForm programId={id} o={o} /></div></details>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              {canManage ? (
                <details><summary className="cursor-pointer text-sm font-medium text-brand-700">+ Nova ocupação</summary><div className="mt-3"><OccupationForm programId={id} /></div></details>
              ) : null}
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader title="Parâmetros do programa" description="Regras configuráveis (RF15)." />
          <CardBody>
            {canSettings ? (
              <ActionForm action={updateProgramSettings} schema="programSettings">
                <input type="hidden" name="id" value={id} />
                <SelectField name="status" label="Status" defaultValue={program.status}>
                  {Object.entries(PROGRAM_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </SelectField>
                <SelectField name="acao_conclusao_exige" label="Conclusão de ações" defaultValue={settings.acao_conclusao_exige ?? "nada"} hint="Aplicada pelo banco a toda conclusão de ação deste programa.">
                  {Object.entries(COMPLETION_RULE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </SelectField>
              </ActionForm>
            ) : (
              <dl className="space-y-2 text-sm">
                <div><dt className="text-slate-600">Conclusão de ações</dt><dd className="font-medium">{COMPLETION_RULE_LABEL[settings.acao_conclusao_exige ?? "nada"]}</dd></div>
              </dl>
            )}
            <p className="mt-4 text-xs text-slate-600">
              Competição, ciclo e unidade não podem ser alterados após a criação. <Link href="/competicoes" className="text-brand-700 hover:underline">Voltar aos programas</Link>
            </p>
          </CardBody>
        </Card>
      </div>
    </>
  );
}

function StageForm({ programId, s, nextPosition = 0 }: { programId: string; s?: Tables<"stages">; nextPosition?: number }) {
  const k = s?.id ?? "novo";
  return (
    <ActionForm action={saveStage} schema="stage" resetOnSuccess={!s}>
      {s ? <input type="hidden" name="id" value={s.id} /> : null}
      <input type="hidden" name="program_id" value={programId} />
      <div className="grid gap-3 sm:grid-cols-3">
        <TextField id={`st-name-${k}`} name="name" label="Nome" defaultValue={s?.name} required className="sm:col-span-2" />
        <TextField id={`st-pos-${k}`} name="position" type="number" min={0} label="Ordem" defaultValue={s?.position ?? nextPosition} />
        <TextField id={`st-start-${k}`} name="start_date" type="date" label="Início" defaultValue={s?.start_date ?? ""} />
        <TextField id={`st-end-${k}`} name="end_date" type="date" label="Término" defaultValue={s?.end_date ?? ""} />
        <TextField id={`st-loc-${k}`} name="location" label="Local" defaultValue={s?.location ?? ""} />
      </div>
      <TextareaField id={`st-notes-${k}`} name="notes" label="Observações" defaultValue={s?.notes ?? ""} />
    </ActionForm>
  );
}

function OccupationForm({ programId, o }: { programId: string; o?: Tables<"occupations"> }) {
  const k = o?.id ?? "novo";
  return (
    <ActionForm action={saveOccupation} schema="occupation" resetOnSuccess={!o}>
      {o ? <input type="hidden" name="id" value={o.id} /> : null}
      <input type="hidden" name="program_id" value={programId} />
      <div className="grid gap-3 sm:grid-cols-3">
        <TextField id={`oc-code-${k}`} name="code" label="Código" defaultValue={o?.code} required placeholder="#33" />
        <TextField id={`oc-name-${k}`} name="name" label="Nome" defaultValue={o?.name} required className="sm:col-span-2" />
        <TextField id={`oc-target-${k}`} name="target_score" type="number" step="0.01" min={0} label="Meta de pontuação" defaultValue={o?.target_score ?? ""} />
        <TextField id={`oc-src-${k}`} name="target_source" label="Fonte da meta" defaultValue={o?.target_source ?? ""} className="sm:col-span-2" hint="Obrigatória quando houver meta." />
      </div>
    </ActionForm>
  );
}
