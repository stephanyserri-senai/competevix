import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { ActionForm } from "@/components/ui/action-form";
import { SelectField, TextareaField } from "@/components/ui/field-errors";
import { RunButton } from "@/components/ui/run-button";
import { hasRole, requireAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime } from "@/lib/dates";
import { addAssignment, publishPanel, removeAssignment, revisePanel, saveScores } from "@/features/inova/actions";
import { bandsFrom, evaluationBreakdown, formatScore, leaves, panelResult, topLevel, type Criterion } from "@/features/inova/domain";

export default async function BancaPage({ params }: PageProps<"/inova/bancas/[id]">) {
  const { id } = await params;
  const access = await requireAccess();
  const supabase = await createClient();
  const { data: panel } = await supabase.from("panels").select("*, project:projects(id, title, problem, solution, differential, value_proposition, business_model, partner_company)").eq("id", id).maybeSingle();
  if (!panel) notFound();
  const [{ data: version }, { data: crit }, { data: assigns }] = await Promise.all([
    supabase.from("rubric_versions").select("id, version, settings, rubric:rubrics(name, official)").eq("id", panel.rubric_version_id).single(),
    supabase.from("rubric_criteria").select("id, parent_id, code, name, description, max_score, position").eq("version_id", panel.rubric_version_id).order("position"),
    supabase.from("panel_assignments").select("id, evaluator_id, status, submitted_at, general_comment, evaluator:profiles!panel_assignments_evaluator_id_fkey(display_name), scores:panel_scores(criterion_id, score, comment)").eq("panel_id", id),
  ]);
  const criteria = (crit ?? []).map((c) => ({ ...c, max_score: Number(c.max_score) })) as (Criterion & { description: string | null })[];
  const isSup = hasRole(access, panel.program_id, "supervisao");
  const { data: canManageRow } = await supabase.from("projects").select("team_id").eq("id", panel.project_id).single();
  const canManage = isSup || (hasRole(access, panel.program_id, "orientador") && Boolean(canManageRow));
  const mine = (assigns ?? []).find((a) => a.evaluator_id === access.userId);
  const planned = panel.status === "planejada";
  const bands = bandsFrom(version?.settings);
  const evals = (assigns ?? []).map((a) => ({ assignment_id: a.id, status: a.status, scores: a.scores.map((s) => ({ criterion_id: s.criterion_id, score: Number(s.score) })) }));
  const result = panelResult(criteria, evals, bands);
  const meta = (version?.settings as { meta_total?: number; meta_grupo?: { codigo: string; valor: number } } | null) ?? null;

  // Candidatos: usuários com vínculo de avaliador vigente no programa (supervisão enxerga os vínculos do programa)
  const { data: candidates } = isSup && planned
    ? await supabase.from("memberships").select("user_id, valid_to, profile:profiles!memberships_user_id_fkey(display_name)").eq("program_id", panel.program_id).in("role", ["supervisao", "orientador"]).is("revoked_at", null)
    : { data: [] };
  const assigned = new Set((assigns ?? []).map((a) => a.evaluator_id));

  return (
    <>
      <PageHeader
        eyebrow={`Simulação interna${panel.version > 1 ? ` · v${panel.version}` : ""} · ${version?.rubric?.name} v${version?.version}${version?.rubric?.official ? "" : " (interna)"}`}
        title={panel.title}
        description={`${panel.project?.title} · ${formatDate(panel.held_on)} · ${panel.status === "planejada" ? "Em andamento" : panel.status === "publicada" ? `Concluída em ${formatDateTime(panel.published_at)}` : "Substituída"} · não substitui a avaliação oficial do evento`}
        actions={
          <>
            <Link href={`/inova?programa=${panel.program_id}&aba=bancas`} className="text-sm text-brand-700 hover:underline">← Simulações</Link>
            {canManage && planned ? <RunButton variant="primary" label="Concluir simulação" onRun={publishPanel.bind(null, id)} confirm="Concluir? Exige todas as avaliações concluídas; depois fica imutável." /> : null}
          </>
        }
      />
      {panel.revision_note ? <Alert tone="info" className="mb-4" title="Revisão">{panel.revision_note}</Alert> : null}
      {panel.status === "substituida" ? <Alert tone="warning" className="mb-4">Esta versão foi substituída por uma revisão.</Alert> : null}

      {mine && planned ? (
        <Card className="mb-6">
          <CardHeader title="Sua pontuação" description={mine.status === "submetida" ? `Concluída em ${formatDateTime(mine.submitted_at)} — imutável.` : "Pontue todos os critérios. Você pode salvar e continuar depois; após concluir, não é possível alterar."} />
          <CardBody>
            {mine.status === "submetida" ? (
              <p className="text-sm">Total registrado: <strong>{formatScore(evaluationBreakdown(criteria, evals.find((e) => e.assignment_id === mine.id)!).total)}</strong></p>
            ) : (
              <ActionForm action={saveScores} hideSubmit className="space-y-4">
                <input type="hidden" name="assignment_id" value={mine.id} />
                <input type="hidden" name="program_id" value={panel.program_id} />
                <input type="hidden" name="panel_id" value={id} />
                {topLevel(criteria).map((t) => {
                  const kids = criteria.filter((c) => c.parent_id === t.id);
                  const items = kids.length ? kids : [t];
                  return (
                    <fieldset key={t.id} className="rounded-md border border-slate-200 p-3">
                      <legend className="px-1 text-sm font-semibold">{t.code} · {t.name} (máx. {formatScore(t.max_score)})</legend>
                      {t.description ? <p className="mb-2 text-xs text-slate-600">{t.description}</p> : null}
                      <div className="grid gap-3 sm:grid-cols-2">
                        {items.map((c) => {
                          const s = mine.scores.find((x) => x.criterion_id === c.id);
                          return (
                            <div key={c.id} className="space-y-1">
                              <label htmlFor={`sc-${c.id}`} className="block text-sm font-medium">{c.name} <span className="text-xs text-slate-500">(0–{formatScore(c.max_score)})</span></label>
                              <input id={`sc-${c.id}`} name={`score_${c.id}`} type="number" min={0} max={c.max_score} step="0.5" defaultValue={s ? Number(s.score) : ""} className="block w-32 rounded-md border border-slate-300 px-3 py-2 text-sm" />
                              <input name={`comment_${c.id}`} defaultValue={s?.comment ?? ""} placeholder="Evidência / comentário" aria-label={`Comentário — ${c.name}`} className="block w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs" />
                            </div>
                          );
                        })}
                      </div>
                    </fieldset>
                  );
                })}
                <p className="text-xs text-slate-600">Escala de inovação (proposta): 0 sem evidência; 1 reprodução; 2 adaptação; 3 incremental; 4 diferenciada; 5 alto impacto.</p>
                <label className="block text-sm"><span className="mb-1 block font-medium">Comentário geral</span>
                  <textarea name="general_comment" className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm" rows={3} /></label>
                <div className="flex flex-wrap gap-2">
                  <button type="submit" name="acao" value="salvar" className="h-10 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium hover:bg-slate-50">Salvar rascunho</button>
                  <button type="submit" name="acao" value="enviar" className="h-10 rounded-md bg-accent-600 px-4 text-sm font-medium text-white hover:bg-accent-700">Salvar e concluir</button>
                </div>
              </ActionForm>
            )}
          </CardBody>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {canManage || panel.status !== "planejada" ? (
            <Card>
              <CardHeader title="Resultado consolidado"
                description={`Média de ${result.count} pontuação(ões) concluída(s)${result.excluded ? `; ${result.excluded} não entram (em andamento)` : ""}. Sem arredondamento antes da classificação.`} />
              <CardBody>
                {result.total === null ? <EmptyState title="Sem pontuação concluída">Conclua a pontuação para ver o resultado.</EmptyState> : (
                  <>
                    <p className="mb-3 text-lg">Total <strong className="text-2xl text-brand-900">{formatScore(result.total)}</strong> / {formatScore(topLevel(criteria).reduce((s, t) => s + t.max_score, 0))} · <Badge tone={result.total >= 90 ? "success" : result.total >= 80 ? "info" : "warning"}>{result.classification}</Badge>
                      {meta?.meta_total ? <span className="ml-2 text-sm text-slate-600">meta ≥ {meta.meta_total}</span> : null}</p>
                    <Table caption="Resultado por grupo">
                      <thead><tr><Th>Critério</Th><Th className="text-right">Média</Th><Th className="text-right">Máximo</Th></tr></thead>
                      <tbody>{topLevel(criteria).map((t) => (
                        <Tr key={t.id}><Td>{t.code} · {t.name}{meta?.meta_grupo?.codigo === t.code ? <span className="ml-1 text-xs text-slate-500">(meta ≥ {meta.meta_grupo.valor})</span> : null}</Td>
                          <Td className="text-right font-medium">{formatScore(result.groups[t.code])}</Td><Td className="text-right">{formatScore(t.max_score)}</Td></Tr>
                      ))}</tbody>
                    </Table>
                  </>
                )}
              </CardBody>
            </Card>
          ) : null}
          {canManage || panel.status !== "planejada" ? (
            <Card>
              <CardHeader title="Quem pontuou" />
              <CardBody>
                {(assigns ?? []).length === 0 ? <p className="text-sm text-slate-600">Ninguém incluído.</p> : (
                  <Table caption="Pontuações">
                    <thead><tr><Th>Pessoa</Th><Th>Situação</Th><Th className="text-right">Total</Th>{canManage && planned ? <Th><span className="sr-only">Ações</span></Th> : null}</tr></thead>
                    <tbody>{(assigns ?? []).map((a) => {
                      const b = evaluationBreakdown(criteria, evals.find((e) => e.assignment_id === a.id)!);
                      return (
                        <Tr key={a.id}>
                          <Td>{a.evaluator?.display_name ?? "Pessoa"}{a.general_comment ? <p className="text-xs text-slate-600">{a.general_comment}</p> : null}</Td>
                          <Td><Badge tone={a.status === "submetida" ? "success" : "warning"}>{a.status === "submetida" ? "Concluída" : `Em andamento (${a.scores.length}/${leaves(criteria).length})`}</Badge></Td>
                          <Td className="text-right">{a.status === "submetida" ? formatScore(b.total) : "—"}</Td>
                          {canManage && planned ? <Td>{a.status === "pendente" ? <RunButton label="Remover" onRun={removeAssignment.bind(null, id, a.id)} confirm="Remover esta pessoa da simulação?" /> : null}</Td> : null}
                        </Tr>
                      );
                    })}</tbody>
                  </Table>
                )}
              </CardBody>
            </Card>
          ) : null}
        </div>
        <div className="space-y-6">
          {isSup && planned ? (
            <Card>
              <CardHeader title="Incluir pessoa da equipe interna" description="Opcional: outra pessoa da supervisão ou orientação também pontua; o resultado é a média." />
              <CardBody>
                {(candidates ?? []).filter((c) => !assigned.has(c.user_id)).length === 0 ? <p className="text-sm text-slate-600">Ninguém mais disponível.</p> : (
                  <ActionForm action={addAssignment} schema="assignment" submitLabel="Incluir" submitVariant="secondary">
                    <input type="hidden" name="panel_id" value={id} />
                    <input type="hidden" name="program_id" value={panel.program_id} />
                    <SelectField name="evaluator_id" label="Pessoa" defaultValue="">
                      <option value="" disabled>Selecione…</option>
                      {(candidates ?? []).filter((c) => !assigned.has(c.user_id)).map((c) => <option key={c.user_id} value={c.user_id}>{c.profile?.display_name ?? "Usuário"}{c.valid_to ? ` (até ${formatDate(c.valid_to)})` : ""}</option>)}
                    </SelectField>
                  </ActionForm>
                )}
              </CardBody>
            </Card>
          ) : null}
          {canManage && panel.status === "publicada" ? (
            <Card>
              <CardHeader title="Refazer simulação" description="Cria nova versão em andamento; a concluída fica no histórico. Inclua quem vai pontuar." />
              <CardBody>
                <ActionForm action={revisePanel} schema="revise" submitLabel="Criar revisão" submitVariant="secondary">
                  <input type="hidden" name="id" value={id} />
                  <TextareaField name="note" label="Motivo" required />
                </ActionForm>
              </CardBody>
            </Card>
          ) : null}
          <Card>
            <CardHeader title="Projeto" />
            <CardBody>
              <dl className="space-y-2 text-sm">
                {[["Problema", panel.project?.problem], ["Solução", panel.project?.solution], ["Diferencial", panel.project?.differential], ["Proposta de valor", panel.project?.value_proposition], ["Modelo de negócio", panel.project?.business_model], ["Empresa", panel.project?.partner_company]].map(([l, v]) => (
                  <div key={l as string}><dt className="font-semibold">{l}</dt><dd className="whitespace-pre-line text-slate-700">{v || "—"}</dd></div>
                ))}
              </dl>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
