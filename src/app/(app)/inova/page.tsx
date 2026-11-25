import Link from "next/link";
import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { ActionForm } from "@/components/ui/action-form";
import { SelectField, TextField, TextareaField } from "@/components/ui/field-errors";
import { RunButton } from "@/components/ui/run-button";
import { ProgramPicker } from "@/components/layout/program-picker";
import { hasRole, requireAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, todayLocal } from "@/lib/dates";
import { listPrograms, pickProgram, programLabel } from "@/features/programas/queries";
import { formatPercent } from "@/features/dashboard/domain";
import {
  STAGES, STAGE_LABEL, bandsFrom, formatScore, inovaIndicators, panelResult, type Criterion, type Stage,
} from "@/features/inova/domain";
import { addCriterion, createPanel, newRubricVersion, publishRubric, removeCriterion, saveProject } from "@/features/inova/actions";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "INOVA SENAI" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const TABS = [["funil", "Projetos e funil"], ["bancas", "Simulação interna"], ["rubricas", "Rubricas"]] as const;
const PANEL_STATUS = { planejada: "Em andamento", publicada: "Concluída", substituida: "Substituída" } as const;
const RUBRIC_STATUS = { rascunho: "Rascunho", publicada: "Publicada", substituida: "Substituída" } as const;

export default async function InovaPage({ searchParams }: PageProps<"/inova">) {
  const sp = await searchParams;
  const access = await requireAccess();
  const supabase = await createClient();
  const all = await listPrograms(supabase);
  const programs = all.filter((p) => p.competition?.kind === "inova");
  const program = pickProgram(programs, sp.programa) ?? programs[0] ?? null;
  const header = (
    <PageHeader eyebrow="RF08" title="INOVA SENAI"
      description="Preparação interna dos projetos: ficha, funil com evidências, simulação com a rubrica e registro dos resultados obtidos no evento. A avaliação oficial acontece no evento; o portal não gerencia bancas nem avaliadores." />
  );
  if (!program) return <>{header}<EmptyState title="Nenhum programa INOVA no seu escopo" /></>;
  const tab = (TABS.find(([k]) => k === one(sp.aba))?.[0] ?? "funil") as (typeof TABS)[number][0];
  const isSup = hasRole(access, program.id, "supervisao");
  const canTeam = isSup || hasRole(access, program.id, "orientador");
  const [{ data: teams }, { data: projects }] = await Promise.all([
    supabase.from("teams").select("id, name").eq("program_id", program.id).is("archived_at", null).order("name"),
    supabase.from("projects").select("id, title, stage, team_id, partner_company, stage_changed_at, archived_at, evidences:project_evidences(kind), results:project_results(level, total_score, innovation_score, placement, held_on)").eq("program_id", program.id).order("title"),
  ]);
  const active = (projects ?? []).filter((p) => !p.archived_at);
  const link = (k: string) => `/inova?programa=${program.id}&aba=${k}`;

  return (
    <>
      {header}
      <div className="mb-4"><ProgramPicker programs={programs.map((p) => ({ id: p.id, label: programLabel(p) }))} value={program.id} /></div>
      <nav aria-label="Seções" className="mb-6 flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map(([k, l]) => (
          <Link key={k} href={link(k)} aria-current={tab === k ? "page" : undefined}
            className={cn("-mb-px border-b-2 px-3 py-2 text-sm", tab === k ? "border-accent-500 font-semibold text-brand-900" : "border-transparent text-slate-600 hover:text-brand-800")}>{l}</Link>
        ))}
      </nav>
      {tab === "funil" ? <Funil /> : null}
      {tab === "bancas" ? <Bancas /> : null}
      {tab === "rubricas" ? <Rubricas /> : null}
    </>
  );

  async function Funil() {
    const ind = inovaIndicators(active.map((p) => ({ id: p.id, stage: p.stage as Stage, evidenceKinds: p.evidences.map((e) => e.kind) })));
    const LEVEL = { estadual: "Estadual", regional: "Regional", nacional: "Nacional", outro: "Outro" } as const;
    const results = active.flatMap((p) => p.results.map((r) => ({ level: r.level, total: r.total_score === null ? null : Number(r.total_score), innovation: r.innovation_score === null ? null : Number(r.innovation_score), placement: r.placement, held_on: r.held_on })));
    const best = results.sort((a, b) => (b.held_on > a.held_on ? 1 : -1))[0] ?? null;
    const teamName = new Map((teams ?? []).map((t) => [t.id, t.name]));
    return (
      <div className="space-y-6">
        <section aria-label="Indicadores INOVA" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="Projetos ativos" value={active.length ? String(active.length) : "Sem dados"} detail="no funil do programa" />
          <Kpi label="Com protótipo funcional" value={active.length ? String(ind.prototypes) : "Sem dados"} detail="evidência do tipo protótipo funcional" />
          <Kpi label="Prioritários com validação empresarial" value={formatPercent(ind.priorityValidatedPct)}
            detail={ind.priorityCount ? `${ind.priorityCount} prioritário(s) · meta 100%` : "nenhum projeto prioritário (N/A)"} />
          <Kpi label="Resultados no evento" value={best ? `${best.placement ? `${best.placement}º` : formatScore(best.total)}` : "Sem dados"}
            detail={best ? `${LEVEL[best.level]} · nota ${formatScore(best.total)} · inovação ${formatScore(best.innovation)} — metas: 1º estadual, top 3 nacional, ≥95 e ≥38/40` : "registre na página do projeto após cada evento"} />
        </section>
        {active.length === 0 ? <EmptyState title="Nenhum projeto visível" /> : (
          <div className="overflow-x-auto pb-2">
            <div className="grid min-w-[1100px] grid-cols-8 gap-2" role="list" aria-label="Funil de projetos">
              {STAGES.map((s) => {
                const items = active.filter((p) => p.stage === s);
                return (
                  <section key={s} role="listitem" aria-label={`${STAGE_LABEL[s]}: ${items.length}`} className="rounded-lg bg-slate-100 p-2">
                    <h2 className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-800">{STAGE_LABEL[s]}<span className="rounded-full bg-white px-1.5">{items.length}</span></h2>
                    <ul className="space-y-1.5">
                      {items.map((p) => (
                        <li key={p.id}>
                          <Link href={`/inova/projetos/${p.id}`} className="block rounded-md border border-slate-200 bg-white p-2 text-xs shadow-sm hover:border-brand-400">
                            <p className="font-medium text-slate-900">{p.title}</p>
                            <p className="text-slate-600">{teamName.get(p.team_id)}</p>
                            <p className="text-slate-500">{p.evidences.length} evidência(s)</p>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          </div>
        )}
        <p className="text-xs text-slate-500">Calendário de referência (PRD §7, a confirmar): fev–mar diagnóstico; abr–mai benchmarking; jun estruturação (10 iniciais → 3 prioritários por escola); jul–set desenvolvimento; out–nov performance.</p>
        {canTeam && (teams ?? []).length ? (
          <Card>
            <CardHeader title="Novo projeto" description="Entra em prospecção. Complete a ficha e registre evidências na página do projeto." />
            <CardBody>
              <ActionForm action={saveProject} schema="project" submitLabel="Criar projeto" className="grid gap-4 sm:grid-cols-2">
                <input type="hidden" name="program_id" value={program!.id} />
                <TextField name="title" label="Título" required />
                <SelectField name="team_id" label="Equipe" required defaultValue="">
                  <option value="" disabled>Selecione…</option>
                  {(teams ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </SelectField>
                <TextareaField name="problem" label="Problema" className="sm:col-span-2" />
                <TextField name="partner_company" label="Empresa parceira" />
              </ActionForm>
            </CardBody>
          </Card>
        ) : null}
      </div>
    );
  }

  async function Bancas() {
    const ids = active.map((p) => p.id);
    const [{ data: panels }, { data: versions }] = await Promise.all([
      ids.length
        ? supabase.from("panels").select("id, title, held_on, status, version, project_id, rubric_version_id").in("project_id", ids).order("held_on", { ascending: false })
        : Promise.resolve({ data: [] as never[] }),
      supabase.from("rubric_versions").select("id, version, status, settings, rubric:rubrics!inner(name, official, competition_id)").eq("status", "publicada").eq("rubric.competition_id", program!.competition_id),
    ]);
    const published = (panels ?? []).filter((p) => p.status === "publicada");
    const vIds = [...new Set(published.map((p) => p.rubric_version_id))];
    const [{ data: crit }, { data: assigns }] = await Promise.all([
      vIds.length ? supabase.from("rubric_criteria").select("id, parent_id, code, name, max_score, position, version_id").in("version_id", vIds) : Promise.resolve({ data: [] as never[] }),
      published.length ? supabase.from("panel_assignments").select("id, panel_id, status, scores:panel_scores(criterion_id, score)").in("panel_id", published.map((p) => p.id)) : Promise.resolve({ data: [] as never[] }),
    ]);
    const projectName = new Map(active.map((p) => [p.id, p.title]));
    const allVersions = await supabase.from("rubric_versions").select("id, settings").in("id", vIds.length ? vIds : ["00000000-0000-0000-0000-000000000000"]);
    const settingsById = new Map((allVersions.data ?? []).map((v) => [v.id, v.settings]));

    return (
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {(panels ?? []).length === 0 ? <EmptyState title="Nenhuma simulação registrada" /> : (
            <Table caption="Simulações internas">
              <thead><tr><Th>Simulação</Th><Th>Projeto</Th><Th>Data</Th><Th>Situação</Th><Th className="text-right">Resultado</Th></tr></thead>
              <tbody>
                {(panels ?? []).map((p) => {
                  let result: ReturnType<typeof panelResult> | null = null;
                  if (p.status === "publicada") {
                    const criteria = (crit ?? []).filter((c) => c.version_id === p.rubric_version_id).map((c) => ({ ...c, max_score: Number(c.max_score) })) as Criterion[];
                    const evals = (assigns ?? []).filter((a) => a.panel_id === p.id).map((a) => ({ assignment_id: a.id, status: a.status, scores: a.scores.map((s) => ({ criterion_id: s.criterion_id, score: Number(s.score) })) }));
                    result = panelResult(criteria, evals, bandsFrom(settingsById.get(p.rubric_version_id)));
                  }
                  return (
                    <Tr key={p.id}>
                      <Td><Link href={`/inova/bancas/${p.id}`} className="font-medium text-brand-700 hover:underline">{p.title}</Link>{p.version > 1 ? <span className="ml-1 text-xs text-slate-500">v{p.version}</span> : null}</Td>
                      <Td className="text-xs">{projectName.get(p.project_id)}</Td>
                      <Td className="text-xs">{formatDate(p.held_on)}</Td>
                      <Td><Badge tone={p.status === "publicada" ? "success" : p.status === "planejada" ? "info" : "neutral"}>{PANEL_STATUS[p.status]}</Badge></Td>
                      <Td className="text-right">{result?.total !== null && result ? <span><strong>{formatScore(result.total)}</strong> <span className="text-xs text-slate-600">{result.classification}</span></span> : <span className="text-xs text-slate-500">—</span>}</Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          )}
          <p className="mt-2 text-xs text-slate-500">Simulação interna para preparar o pitch: a própria equipe (orientação/supervisão) pontua com a rubrica. Resultado = média das avaliações concluídas, sem arredondamento antes da classificação (≥95 excelente; 90–&lt;95 muito bom; 80–&lt;90 intermediário; 70–&lt;80 baixo; &lt;70 insuficiente). Não substitui a avaliação oficial do evento.</p>
        </div>
        {canTeam && active.length ? (
          <Card>
            <CardHeader title="Nova simulação" description="Você pontua o projeto com a rubrica; outras pessoas da equipe interna podem ser incluídas." />
            <CardBody>
              {(versions ?? []).length === 0 ? <Alert tone="warning">Publique uma rubrica na aba Rubricas.</Alert> : (
                <ActionForm action={createPanel} schema="panel" submitLabel="Iniciar simulação">
                  <input type="hidden" name="program_id" value={program!.id} />
                  <TextField name="title" label="Título" required placeholder="Ex.: Simulação de pitch — dezembro" />
                  <SelectField name="project_id" label="Projeto" required defaultValue="">
                    <option value="" disabled>Selecione…</option>
                    {active.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                  </SelectField>
                  <SelectField name="rubric_version_id" label="Rubrica" required defaultValue={(versions ?? [])[0]?.id}>
                    {(versions ?? []).map((v) => <option key={v.id} value={v.id}>{v.rubric?.name} v{v.version}{v.rubric?.official ? " (oficial)" : " (interna)"}</option>)}
                  </SelectField>
                  <TextField name="held_on" type="date" label="Data" defaultValue={todayLocal()} required />
                </ActionForm>
              )}
            </CardBody>
          </Card>
        ) : null}
      </div>
    );
  }

  async function Rubricas() {
    const { data: rubrics } = await supabase.from("rubrics").select("id, name, description, official, versions:rubric_versions(id, version, status, notes, settings)").eq("competition_id", program!.competition_id).order("name");
    const versionIds = (rubrics ?? []).flatMap((r) => r.versions.map((v) => v.id));
    const { data: crit } = versionIds.length
      ? await supabase.from("rubric_criteria").select("id, version_id, parent_id, code, name, max_score, position").in("version_id", versionIds).order("position")
      : { data: [] };
    return (
      <div className="space-y-6">
        <Alert tone="warning" title="Rubrica interna ≠ regulamento oficial">A rubrica preliminar do PRD é uma proposta interna. Quando o regulamento oficial for validado, cadastre-o como nova rubrica marcada como oficial.</Alert>
        {(rubrics ?? []).length === 0 ? <EmptyState title="Nenhuma rubrica para esta competição" /> : (rubrics ?? []).map((r) => (
          <Card key={r.id}>
            <CardHeader title={<>{r.name} {r.official ? <Badge tone="success">Oficial</Badge> : <Badge tone="warning">Interna / preliminar</Badge>}</>} description={r.description ?? undefined} />
            <CardBody className="space-y-4">
              {[...r.versions].sort((a, b) => b.version - a.version).map((v) => {
                const cs = (crit ?? []).filter((c) => c.version_id === v.id);
                const tops = cs.filter((c) => !c.parent_id);
                const draft = v.status === "rascunho";
                return (
                  <div key={v.id} className="rounded-md border border-slate-200 p-3">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold">Versão {v.version} <Badge tone={v.status === "publicada" ? "success" : v.status === "rascunho" ? "warning" : "neutral"}>{RUBRIC_STATUS[v.status]}</Badge>
                        <span className="ml-2 text-xs font-normal text-slate-500">Total {formatScore(tops.reduce((s, t) => s + Number(t.max_score), 0))}</span></p>
                      {isSup ? (
                        <span className="flex gap-2">
                          {draft ? <RunButton variant="primary" label="Publicar" onRun={publishRubric.bind(null, v.id)} confirm="Publicar? A versão fica imutável e substitui a publicada." /> : null}
                          {v.status === "publicada" ? <RunButton variant="secondary" label="Nova versão" onRun={newRubricVersion.bind(null, v.id)} /> : null}
                        </span>
                      ) : null}
                    </div>
                    <ul className="space-y-1 text-sm">
                      {tops.map((t) => (
                        <li key={t.id}>
                          <span className="font-medium">{t.code} · {t.name}</span> <span className="text-xs text-slate-500">máx. {formatScore(Number(t.max_score))}</span>
                          {isSup && draft ? <RunButton label="Remover" onRun={removeCriterion.bind(null, t.id)} /> : null}
                          <ul className="ml-5 list-disc text-xs text-slate-700">
                            {cs.filter((c) => c.parent_id === t.id).map((c) => (
                              <li key={c.id}>{c.code} · {c.name} (0–{formatScore(Number(c.max_score))}) {isSup && draft ? <RunButton label="Remover" onRun={removeCriterion.bind(null, c.id)} /> : null}</li>
                            ))}
                          </ul>
                        </li>
                      ))}
                    </ul>
                    {isSup && draft ? (
                      <details className="mt-3">
                        <summary className="cursor-pointer text-sm text-brand-700">+ Incluir critério</summary>
                        <ActionForm action={addCriterion} schema="criterion" resetOnSuccess submitLabel="Incluir" submitVariant="secondary" className="mt-2 grid gap-3 sm:grid-cols-5">
                          <input type="hidden" name="version_id" value={v.id} />
                          <SelectField id={`pa-${v.id}`} name="parent_id" label="Grupo" defaultValue="">
                            <option value="">— (critério de topo)</option>
                            {tops.map((t) => <option key={t.id} value={t.id}>{t.code}</option>)}
                          </SelectField>
                          <TextField id={`co-${v.id}`} name="code" label="Código" required />
                          <TextField id={`no-${v.id}`} name="name" label="Nome" required />
                          <TextField id={`mx-${v.id}`} name="max_score" type="number" step="0.5" label="Máximo" required />
                          <TextField id={`po-${v.id}`} name="position" type="number" label="Ordem" defaultValue={cs.length} />
                        </ActionForm>
                      </details>
                    ) : null}
                  </div>
                );
              })}
            </CardBody>
          </Card>
        ))}
      </div>
    );
  }
}

function Kpi({ label, value, detail }: { label: string; value: string; detail?: string }) {
  const empty = value === "Sem dados" || value === "N/A";
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-sm font-medium text-slate-700">{label}</p>
      <p className={empty ? "text-lg font-semibold text-slate-500" : "text-3xl font-bold text-brand-900"}>{value}</p>
      {detail ? <p className="text-xs text-slate-600">{detail}</p> : null}
    </div>
  );
}
