import Link from "next/link";
import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { ActionForm } from "@/components/ui/action-form";
import { SelectField, TextField } from "@/components/ui/field-errors";
import { RunButton } from "@/components/ui/run-button";
import { ProgramPicker } from "@/components/layout/program-picker";
import { hasRole, requireAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addDays, formatDate, formatDateTime, isValidLocalDate, startOfMonth, addMonths, startOfWeek, todayLocal } from "@/lib/dates";
import { listPrograms, pickProgram, programLabel } from "@/features/programas/queries";
import { listPeopleOptions } from "@/features/equipes/queries";
import { loadChData } from "@/features/worldskills/queries";
import {
  ASSESSMENT_TYPE_LABEL, CH_TARGET_PCT, PLAN_STATUS_LABEL, SCALE_LABEL, chByPerson, chTotal, deviation, executionRate,
  formatMinutes, latestComparable, rampTargetFor, type Scale,
} from "@/features/worldskills/domain";
import { formatPercent } from "@/features/dashboard/domain";
import {
  createAssessment, createPlan, createSession, endAllocation, saveAllocation, saveCompetency, saveScoreTarget,
} from "@/features/worldskills/actions";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "WorldSkills" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const TABS = [
  ["visao", "Visão geral"], ["planos", "Planos"], ["sessoes", "Sessões e presença"], ["simulados", "Simulados"],
  ["alocacoes", "Alocações"], ["competencias", "Competências"], ["rampa", "Rampa"],
] as const;

export default async function WorldSkillsPage({ searchParams }: PageProps<"/worldskills">) {
  const sp = await searchParams;
  const access = await requireAccess();
  const supabase = await createClient();
  const all = await listPrograms(supabase);
  const programs = all.filter((p) => p.competition?.kind === "worldskills");
  const program = pickProgram(programs, sp.programa) ?? programs[0] ?? null;
  const header = (
    <PageHeader eyebrow="RF07" title="WorldSkills"
      description="Plano por competência, sessões e presença, simulados com análise de erros e rampa de pontuação. CH = minutos efetivos ÷ previstos; comparação só entre escalas equivalentes." />
  );
  if (!program) return <>{header}<EmptyState title="Nenhum programa WorldSkills no seu escopo" /></>;

  const tab = (TABS.find(([k]) => k === one(sp.aba))?.[0] ?? "visao") as (typeof TABS)[number][0];
  const today = todayLocal();
  const week = startOfWeek(isValidLocalDate(one(sp.semana)) ? one(sp.semana) : today);
  const weekEnd = addDays(week, 6);
  const isSup = hasRole(access, program.id, "supervisao");
  const canTeam = isSup || hasRole(access, program.id, "orientador");
  const [{ data: teams }, { data: occupations }, { data: competencies }, people] = await Promise.all([
    supabase.from("teams").select("id, name, occupation_id").eq("program_id", program.id).is("archived_at", null).order("name"),
    supabase.from("occupations").select("id, code, name, target_score, target_scale, target_source").eq("program_id", program.id).is("archived_at", null).order("code"),
    supabase.from("competencies").select("id, occupation_id, name, weight, weight_source, archived_at, position").eq("program_id", program.id).order("position").order("name"),
    listPeopleOptions(supabase, program.unit_id),
  ]);
  const occName = new Map((occupations ?? []).map((o) => [o.id, `${o.code} ${o.name}`]));
  const link = (over: Record<string, string>) => `/worldskills?${new URLSearchParams({ programa: program.id, aba: tab, semana: week, ...over })}`;

  return (
    <>
      {header}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <ProgramPicker programs={programs.map((p) => ({ id: p.id, label: programLabel(p) }))} value={program.id} />
        <div className="flex items-center gap-2 text-sm">
          <Link href={link({ semana: addDays(week, -7) })} className="rounded-md border border-slate-300 bg-white px-3 py-1.5" aria-label="Semana anterior">←</Link>
          <span className="font-medium">Semana {formatDate(week)} – {formatDate(weekEnd)}</span>
          <Link href={link({ semana: addDays(week, 7) })} className="rounded-md border border-slate-300 bg-white px-3 py-1.5" aria-label="Próxima semana">→</Link>
        </div>
      </div>
      <nav aria-label="Seções" className="mb-6 flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map(([k, l]) => (
          <Link key={k} href={link({ aba: k })} aria-current={tab === k ? "page" : undefined}
            className={cn("-mb-px border-b-2 px-3 py-2 text-sm", tab === k ? "border-accent-500 font-semibold text-brand-900" : "border-transparent text-slate-600 hover:text-brand-800")}>
            {l}
          </Link>
        ))}
      </nav>

      {tab === "visao" ? <Visao /> : null}
      {tab === "alocacoes" ? <Alocacoes /> : null}
      {tab === "competencias" ? <Competencias /> : null}
      {tab === "planos" ? <Planos /> : null}
      {tab === "sessoes" ? <Sessoes /> : null}
      {tab === "simulados" ? <Simulados /> : null}
      {tab === "rampa" ? <Rampa /> : null}
    </>
  );

  async function Visao() {
    const monthStart = startOfMonth(week);
    const monthEnd = addDays(addMonths(monthStart, 1), -1);
    const [{ allocations, attendance }, { data: items }, { data: scores }, { data: ramp }] = await Promise.all([
      loadChData(supabase, program!.id, week, weekEnd),
      supabase.from("training_items").select("due_date, status, plan:training_plans!inner(team_id, status)").eq("program_id", program!.id).eq("plan.status", "publicado").gte("due_date", monthStart).lte("due_date", monthEnd),
      supabase.from("assessments").select("id, held_on, type, scale, occupation_id, team_id, status, results:assessment_results(score, person_id, criterion)").eq("program_id", program!.id).eq("status", "publicado").order("held_on", { ascending: false }).limit(200),
      supabase.from("score_targets").select("occupation_id, month, target, scale, status").eq("program_id", program!.id),
    ]);
    const teamScores = (scores ?? []).flatMap((a) => {
      const r = a.results.find((x) => x.person_id === null && x.criterion === null);
      return r ? [{ id: a.id, held_on: a.held_on, type: a.type, scale: a.scale as Scale, score: Number(r.score), occupation_id: a.occupation_id, team_id: a.team_id }] : [];
    });
    const rampRows = (ramp ?? []).map((r) => ({ ...r, target: Number(r.target), scale: r.scale as Scale }));
    const personName = new Map(people.map((p) => [p.id, p.full_name]));
    if ((teams ?? []).length === 0) return <EmptyState title="Nenhuma equipe visível neste programa" />;

    return (
      <div className="space-y-6">
        {allocations.length === 0 ? (
          <Alert tone="info" title="CH sem denominador">Não há alocações vigentes na semana: a CH aparece como N/A. A supervisão cadastra jornada e percentual em “Alocações”.</Alert>
        ) : null}
        {(teams ?? []).map((t) => {
          const rows = chByPerson(allocations, attendance, week, weekEnd, { teamId: t.id });
          const total = chTotal(rows);
          const execW = executionRate((items ?? []).filter((i) => i.plan?.team_id === t.id), week, weekEnd);
          const execM = executionRate((items ?? []).filter((i) => i.plan?.team_id === t.id), monthStart, monthEnd);
          const occ = (occupations ?? []).find((o) => o.id === t.occupation_id);
          const last = occ ? latestComparable(teamScores.filter((s) => s.team_id === t.id), occ.id, occ.target_scale as Scale) : null;
          const rampT = occ && last ? rampTargetFor(rampRows, occ.id, last.held_on, last.scale) : null;
          return (
            <Card key={t.id}>
              <CardHeader title={t.name} description={occ ? `${occ.code} ${occ.name}` : "Equipe sem ocupação"} />
              <CardBody className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Metric label="CH da semana" value={formatPercent(total.pct)} tone={total.pct !== null && total.pct < CH_TARGET_PCT ? "warning" : undefined}
                    detail={total.planned ? `${formatMinutes(total.effective)} de ${formatMinutes(total.planned)} · meta ≥ ${CH_TARGET_PCT}%` : "sem alocação (denominador 0)"} />
                  <Metric label="Execução do plano (semana)" value={formatPercent(execW.pct)} detail={execW.total ? `${execW.done} de ${execW.total} itens` : "sem itens previstos"} />
                  <Metric label="Execução do plano (mês)" value={formatPercent(execM.pct)} detail={execM.total ? `${execM.done} de ${execM.total} itens` : "sem itens previstos"} />
                  <Metric label="Último simulado comparável" value={last ? String(last.score) : "Sem dados"}
                    detail={last ? `${formatDate(last.held_on)} · rampa: ${rampT ? `${rampT.target} (${rampT.status}) → desvio ${deviation(last.score, rampT.target)}` : "sem meta do mês"} · meta final ${occ?.target_score ?? "—"} → ${deviation(last.score, occ?.target_score !== null && occ?.target_score !== undefined ? Number(occ.target_score) : null) ?? "N/A"}` : `${occ ? SCALE_LABEL[occ.target_scale as Scale] : "—"}: nenhum simulado publicado`} />
                </div>
                {rows.length ? (
                  <Table caption={`CH por pessoa — ${t.name}`}>
                    <thead><tr><Th>Pessoa</Th><Th className="text-right">Previsto</Th><Th className="text-right">Efetivo</Th><Th className="text-right">CH</Th></tr></thead>
                    <tbody>
                      {rows.map((r) => (
                        <Tr key={r.person_id}>
                          <Td>{personName.get(r.person_id) ?? "Pessoa"}</Td>
                          <Td className="text-right">{formatMinutes(r.planned)}</Td>
                          <Td className="text-right">{formatMinutes(r.effective)}</Td>
                          <Td className="text-right">{r.pct === null ? <span className="text-slate-500">N/A</span> : <Badge tone={r.pct >= CH_TARGET_PCT ? "success" : "warning"}>{formatPercent(r.pct)}</Badge>}</Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                ) : <p className="text-sm text-slate-600">Sem alocações nem presenças nesta semana.</p>}
              </CardBody>
            </Card>
          );
        })}
        <p className="text-xs text-slate-500">
          Metodologia: previsto = alocações vigentes rateadas por dia útil (seg–sex) do período real, sem descontar feriados (calendário oficial pendente); efetivo = presença individual por sessão;
          execução = itens concluídos ÷ previstos com prazo no período (cancelados excluídos); desvio só com escala equivalente. Indicadores em escalas diferentes aparecem como N/A.
        </p>
      </div>
    );
  }

  async function Alocacoes() {
    const { allocations } = await loadChData(supabase, program!.id, "1900-01-01", "2999-12-31");
    return (
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {allocations.length === 0 ? <EmptyState title="Nenhuma alocação visível" /> : (
            <Table caption="Alocações">
              <thead><tr><Th>Pessoa</Th><Th>Equipe</Th><Th className="text-right">Jornada</Th><Th className="text-right">%</Th><Th className="text-right">Previsto/sem.</Th><Th>Vigência</Th>{isSup ? <Th><span className="sr-only">Ações</span></Th> : null}</tr></thead>
              <tbody>
                {allocations.map((a) => (
                  <Tr key={a.id}>
                    <Td>{a.person?.full_name ?? "—"}{a.note ? <p className="text-xs text-slate-500">{a.note}</p> : null}</Td>
                    <Td className="text-xs">{a.team?.name ?? "Programa"}</Td>
                    <Td className="text-right">{formatMinutes(a.base_weekly_minutes)}</Td>
                    <Td className="text-right">{a.percent.toLocaleString("pt-BR")}%</Td>
                    <Td className="text-right font-medium">{formatMinutes(a.planned_weekly_minutes)}</Td>
                    <Td className="whitespace-nowrap text-xs">{formatDate(a.valid_from)} → {a.valid_to ? formatDate(a.valid_to) : "sem término"}</Td>
                    {isSup ? <Td>{!a.valid_to || a.valid_to >= today ? <RunButton label="Encerrar hoje" onRun={endAllocation.bind(null, a.id, today)} confirm="Encerrar esta alocação hoje?" /> : null}</Td> : null}
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
        {isSup ? (
          <Card>
            <CardHeader title="Nova alocação" description="Jornada e percentual por pessoa e vigência (sem fixar 25h — PRD §6). Mudou a jornada? Encerre a vigência e crie outra." />
            <CardBody>
              <ActionForm action={saveAllocation} schema="allocation" resetOnSuccess submitLabel="Alocar">
                <input type="hidden" name="program_id" value={program!.id} />
                <SelectField name="person_id" label="Pessoa" required defaultValue="">
                  <option value="" disabled>Selecione…</option>
                  {people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                </SelectField>
                <SelectField name="team_id" label="Equipe" defaultValue="" hint="Pessoa em duas equipes = uma alocação por equipe.">
                  <option value="">Programa (sem equipe)</option>
                  {(teams ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </SelectField>
                <div className="grid grid-cols-2 gap-3">
                  <TextField name="base_weekly_hours" type="number" step="0.5" min={1} label="Jornada semanal (h)" defaultValue={40} required />
                  <TextField name="percent" type="number" step="1" min={1} max={100} label="% dedicada" defaultValue={100} required />
                  <TextField name="valid_from" type="date" label="Início" defaultValue={today} required />
                  <TextField name="valid_to" type="date" label="Fim (opcional)" />
                </div>
                <TextField name="note" label="Observação" hint="Ex.: diretriz de 50% da CH (reunião 24/11) — a validar." />
              </ActionForm>
            </CardBody>
          </Card>
        ) : null}
      </div>
    );
  }

  async function Competencias() {
    return (
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Alert tone="info">Lista inicial sugerida no PRD §6. Pesos só após validar os documentos técnicos oficiais; peso exige fonte.</Alert>
          {(occupations ?? []).length === 0 ? <EmptyState title="Cadastre ocupações em Competições" /> : (occupations ?? []).map((o) => {
            const list = (competencies ?? []).filter((c) => c.occupation_id === o.id);
            return (
              <Card key={o.id}>
                <CardHeader title={`${o.code} ${o.name}`} description={`${list.length} competência(s)`} />
                <CardBody>
                  {list.length === 0 ? <p className="text-sm text-slate-600">Nenhuma competência cadastrada.</p> : (
                    <ul className="flex flex-wrap gap-2">
                      {list.map((c) => <li key={c.id} className="rounded-md border border-slate-200 px-2 py-1 text-sm">{c.name}{c.weight !== null ? <span className="ml-1 text-xs text-slate-500">peso {Number(c.weight)}</span> : null}</li>)}
                    </ul>
                  )}
                </CardBody>
              </Card>
            );
          })}
        </div>
        {isSup ? (
          <Card>
            <CardHeader title="Nova competência" />
            <CardBody>
              <ActionForm action={saveCompetency} schema="competency" resetOnSuccess submitLabel="Incluir">
                <input type="hidden" name="program_id" value={program!.id} />
                <SelectField name="occupation_id" label="Ocupação" required defaultValue="">
                  <option value="" disabled>Selecione…</option>
                  {(occupations ?? []).map((o) => <option key={o.id} value={o.id}>{o.code} {o.name}</option>)}
                </SelectField>
                <TextField name="name" label="Competência" required placeholder="Ex.: CLP, Diagnóstico, Texturização" />
                <TextField name="weight" type="number" step="0.01" min={0} label="Peso (opcional)" />
                <TextField name="weight_source" label="Fonte do peso" hint="Obrigatória se houver peso." />
              </ActionForm>
            </CardBody>
          </Card>
        ) : null}
      </div>
    );
  }

  async function Planos() {
    const { data: plans } = await supabase.from("training_plans").select("id, title, version, status, period_start, period_end, team_id, change_note, published_at").eq("program_id", program!.id).order("period_start", { ascending: false }).order("version", { ascending: false });
    const teamName = new Map((teams ?? []).map((t) => [t.id, t.name]));
    return (
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {(plans ?? []).length === 0 ? <EmptyState title="Nenhum plano de treinamento" /> : (
            <Table caption="Planos">
              <thead><tr><Th>Plano</Th><Th>Equipe</Th><Th>Período</Th><Th>Situação</Th></tr></thead>
              <tbody>
                {(plans ?? []).map((p) => (
                  <Tr key={p.id}>
                    <Td><Link href={`/worldskills/planos/${p.id}`} className="font-medium text-brand-700 hover:underline">{p.title}</Link> <span className="text-xs text-slate-500">v{p.version}</span>{p.change_note ? <p className="text-xs text-slate-500">{p.change_note}</p> : null}</Td>
                    <Td className="text-xs">{teamName.get(p.team_id)}</Td>
                    <Td className="whitespace-nowrap text-xs">{formatDate(p.period_start)} – {formatDate(p.period_end)}</Td>
                    <Td><Badge tone={p.status === "publicado" ? "success" : p.status === "rascunho" ? "warning" : "neutral"}>{PLAN_STATUS_LABEL[p.status]}</Badge></Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
        {canTeam && (teams ?? []).length ? (
          <Card>
            <CardHeader title="Novo plano" description="Rascunho → itens → publicar. Alterações depois geram nova versão." />
            <CardBody>
              <ActionForm action={createPlan} schema="trainingPlan" submitLabel="Criar rascunho">
                <input type="hidden" name="program_id" value={program!.id} />
                <SelectField name="team_id" label="Equipe" required defaultValue="">
                  <option value="" disabled>Selecione…</option>
                  {(teams ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </SelectField>
                <TextField name="title" label="Título" required placeholder="Ex.: Plano de dezembro" />
                <div className="grid grid-cols-2 gap-3">
                  <TextField name="period_start" type="date" label="Início" defaultValue={startOfMonth(today)} required />
                  <TextField name="period_end" type="date" label="Fim" defaultValue={addDays(addMonths(startOfMonth(today), 1), -1)} required />
                </div>
              </ActionForm>
            </CardBody>
          </Card>
        ) : null}
      </div>
    );
  }

  async function Sessoes() {
    const { sessions } = await loadChData(supabase, program!.id, week, weekEnd);
    const ids = sessions.map((s) => s.id);
    const [{ data: detail }, { data: att }] = ids.length
      ? await Promise.all([
          supabase.from("training_sessions").select("id, starts_at, actual_minutes, team_id, competency:competencies(name)").in("id", ids).order("starts_at"),
          supabase.from("attendance").select("session_id").in("session_id", ids),
        ])
      : [{ data: [] }, { data: [] }];
    const attCount = new Map<string, number>();
    for (const a of att ?? []) attCount.set(a.session_id, (attCount.get(a.session_id) ?? 0) + 1);
    const teamName = new Map((teams ?? []).map((t) => [t.id, t.name]));
    return (
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {(detail ?? []).length === 0 ? <EmptyState title="Nenhuma sessão nesta semana" /> : (
            <Table caption="Sessões da semana">
              <thead><tr><Th>Início</Th><Th>Equipe</Th><Th>Competência</Th><Th className="text-right">Efetiva</Th><Th className="text-right">Presenças</Th></tr></thead>
              <tbody>
                {(detail ?? []).map((s) => (
                  <Tr key={s.id}>
                    <Td><Link href={`/worldskills/sessoes/${s.id}`} className="font-medium text-brand-700 hover:underline">{formatDateTime(s.starts_at)}</Link></Td>
                    <Td className="text-xs">{teamName.get(s.team_id)}</Td>
                    <Td className="text-xs">{s.competency?.name ?? "—"}</Td>
                    <Td className="text-right">{formatMinutes(s.actual_minutes)}</Td>
                    <Td className="text-right">{attCount.get(s.id) ?? 0}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
        {canTeam && (teams ?? []).length ? (
          <Card>
            <CardHeader title="Registrar sessão" description="Duração efetiva = intervalo − pausas. Depois registre a presença individual." />
            <CardBody>
              <ActionForm action={createSession} schema="session" submitLabel="Registrar e lançar presença">
                <input type="hidden" name="program_id" value={program!.id} />
                <SelectField name="team_id" label="Equipe" required defaultValue="">
                  <option value="" disabled>Selecione…</option>
                  {(teams ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </SelectField>
                <SelectField name="competency_id" label="Competência" defaultValue="">
                  <option value="">—</option>
                  {(competencies ?? []).filter((c) => !c.archived_at).map((c) => <option key={c.id} value={c.id}>{occName.get(c.occupation_id)} · {c.name}</option>)}
                </SelectField>
                <TextField name="date" type="date" label="Data" defaultValue={today} required />
                <div className="grid grid-cols-3 gap-3">
                  <TextField name="start_time" type="time" label="Início" defaultValue="08:00" required />
                  <TextField name="end_time" type="time" label="Término" defaultValue="12:00" required />
                  <TextField name="break_minutes" type="number" min={0} label="Pausas (min)" defaultValue={0} />
                </div>
                <TextField name="location" label="Local" />
              </ActionForm>
            </CardBody>
          </Card>
        ) : null}
      </div>
    );
  }

  async function Simulados() {
    const { data: list } = await supabase.from("assessments").select("id, title, type, held_on, scale, scale_max, status, team_id, occupation_id").eq("program_id", program!.id).order("held_on", { ascending: false }).limit(200);
    const teamName = new Map((teams ?? []).map((t) => [t.id, t.name]));
    return (
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Alert tone="info" className="mb-4">Referência de cadência (a confirmar): parcial semanal, completo mensal, externo trimestral. Nota bruta não é convertida para a escala WorldSkills sem metodologia validada.</Alert>
          {(list ?? []).length === 0 ? <EmptyState title="Nenhum simulado registrado" /> : (
            <Table caption="Simulados">
              <thead><tr><Th>Simulado</Th><Th>Equipe</Th><Th>Data</Th><Th>Escala</Th><Th>Situação</Th></tr></thead>
              <tbody>
                {(list ?? []).map((a) => (
                  <Tr key={a.id}>
                    <Td><Link href={`/worldskills/simulados/${a.id}`} className="font-medium text-brand-700 hover:underline">{a.title}</Link> <Badge>{ASSESSMENT_TYPE_LABEL[a.type]}</Badge></Td>
                    <Td className="text-xs">{teamName.get(a.team_id)}</Td>
                    <Td className="text-xs">{formatDate(a.held_on)}</Td>
                    <Td className="text-xs">{SCALE_LABEL[a.scale as Scale]} (máx. {Number(a.scale_max)})</Td>
                    <Td><Badge tone={a.status === "publicado" ? "success" : "warning"}>{a.status === "publicado" ? "Publicado" : "Rascunho"}</Badge></Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
        {canTeam && (teams ?? []).length ? (
          <Card>
            <CardHeader title="Novo simulado" />
            <CardBody>
              <ActionForm action={createAssessment} schema="assessment" submitLabel="Criar e lançar notas">
                <input type="hidden" name="program_id" value={program!.id} />
                <TextField name="title" label="Título" required />
                <SelectField name="team_id" label="Equipe" required defaultValue="">
                  <option value="" disabled>Selecione…</option>
                  {(teams ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </SelectField>
                <SelectField name="occupation_id" label="Ocupação" defaultValue="">
                  <option value="">—</option>
                  {(occupations ?? []).map((o) => <option key={o.id} value={o.id}>{o.code} {o.name}</option>)}
                </SelectField>
                <div className="grid grid-cols-2 gap-3">
                  <SelectField name="type" label="Tipo" defaultValue="parcial">
                    {Object.entries(ASSESSMENT_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </SelectField>
                  <TextField name="held_on" type="date" label="Data" defaultValue={today} required />
                  <SelectField name="scale" label="Escala" defaultValue="pontos_brutos">
                    {Object.entries(SCALE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </SelectField>
                  <TextField name="scale_max" type="number" step="0.01" label="Máximo da escala" required />
                  <TextField name="planned_minutes" type="number" label="Tempo de prova (min)" />
                  <TextField name="actual_minutes" type="number" label="Tempo usado (min)" />
                  <TextField name="test_version" label="Versão da prova" />
                  <TextField name="criteria_version" label="Versão dos critérios" />
                </div>
              </ActionForm>
            </CardBody>
          </Card>
        ) : null}
      </div>
    );
  }

  async function Rampa() {
    const { data: ramp } = await supabase.from("score_targets").select("id, occupation_id, month, target, scale, status, source").eq("program_id", program!.id).order("month");
    return (
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Alert tone="warning">Pontos intermediários da rampa ainda não foram aprovados (PRD §6): cadastre como “proposta” até a validação.</Alert>
          {(occupations ?? []).map((o) => {
            const rows = (ramp ?? []).filter((r) => r.occupation_id === o.id);
            return (
              <Card key={o.id}>
                <CardHeader title={`${o.code} ${o.name}`} description={`Meta final: ${o.target_score ?? "—"} (${SCALE_LABEL[o.target_scale as Scale]})`} />
                <CardBody>
                  {rows.length === 0 ? <p className="text-sm text-slate-600">Sem metas mensais.</p> : (
                    <Table caption={`Rampa ${o.code}`}>
                      <thead><tr><Th>Mês</Th><Th className="text-right">Meta</Th><Th>Escala</Th><Th>Situação</Th><Th>Fonte</Th></tr></thead>
                      <tbody>{rows.map((r) => (
                        <Tr key={r.id}><Td>{r.month.slice(5, 7)}/{r.month.slice(0, 4)}</Td><Td className="text-right">{Number(r.target)}</Td><Td className="text-xs">{SCALE_LABEL[r.scale as Scale]}</Td>
                          <Td><Badge tone={r.status === "aprovada" ? "success" : "warning"}>{r.status === "aprovada" ? "Aprovada" : "Proposta"}</Badge></Td><Td className="text-xs">{r.source}</Td></Tr>
                      ))}</tbody>
                    </Table>
                  )}
                </CardBody>
              </Card>
            );
          })}
        </div>
        {isSup && (occupations ?? []).length ? (
          <Card>
            <CardHeader title="Meta mensal" description="Mesmo mês/ocupação/escala substitui o valor anterior (auditado)." />
            <CardBody>
              <ActionForm action={saveScoreTarget} schema="scoreTarget" submitLabel="Salvar meta">
                <input type="hidden" name="program_id" value={program!.id} />
                <SelectField name="occupation_id" label="Ocupação" required defaultValue="">
                  <option value="" disabled>Selecione…</option>
                  {(occupations ?? []).map((o) => <option key={o.id} value={o.id}>{o.code} {o.name}</option>)}
                </SelectField>
                <div className="grid grid-cols-2 gap-3">
                  <TextField name="month" type="month" label="Mês" defaultValue={today.slice(0, 7)} required />
                  <TextField name="target" type="number" step="0.01" label="Meta" required />
                </div>
                <SelectField name="scale" label="Escala" defaultValue="worldskills">
                  {Object.entries(SCALE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </SelectField>
                <SelectField name="status" label="Situação" defaultValue="proposta">
                  <option value="proposta">Proposta</option>
                  <option value="aprovada">Aprovada</option>
                </SelectField>
                <TextField name="source" label="Fonte / justificativa" required />
              </ActionForm>
            </CardBody>
          </Card>
        ) : null}
      </div>
    );
  }
}

function Metric({ label, value, detail, tone }: { label: string; value: string; detail?: string; tone?: "warning" }) {
  return (
    <div className="rounded-md border border-slate-200 p-3">
      <p className="text-xs font-medium text-slate-600">{label}</p>
      <p className={cn("text-2xl font-bold", tone === "warning" ? "text-amber-700" : "text-brand-900", value === "Sem dados" || value === "N/A" ? "text-base text-slate-500" : "")}>{value}</p>
      {detail ? <p className="text-xs text-slate-600">{detail}</p> : null}
    </div>
  );
}
