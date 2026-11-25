import Link from "next/link";
import type { Metadata } from "next";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { PrintButton } from "@/components/ui/print-button";
import { buttonClass } from "@/components/ui/button";
import { ProgramPicker } from "@/components/layout/program-picker";
import { hasRole, requireAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime, zonedToUtc, addDays } from "@/lib/dates";
import { listPrograms, pickProgram, programLabel } from "@/features/programas/queries";
import { reportPeriod, type Periodicity } from "@/features/relatorios/period";
import { STATUS_LABEL, STATUS_ORDER } from "@/features/acoes/domain";
import { loadChData } from "@/features/worldskills/queries";
import { CH_TARGET_PCT, REPORT_STATUS_LABEL, chByPerson, chTotal, executionRate, formatMinutes } from "@/features/worldskills/domain";
import { formatPercent } from "@/features/dashboard/domain";
import { STAGES, STAGE_LABEL } from "@/features/inova/domain";
import { RISK_LEVEL_LABEL, riskLevel } from "@/features/riscos/domain";
import { REQUEST_STATUS_LABEL } from "@/features/recursos/domain";
import { formatBRL, summarize } from "@/features/orcamento/domain";

export const metadata: Metadata = { title: "Relatórios" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function RelatoriosPage({ searchParams }: PageProps<"/relatorios">) {
  const sp = await searchParams;
  const access = await requireAccess();
  const supabase = await createClient();
  const programs = await listPrograms(supabase);
  const program = pickProgram(programs, sp.programa) ?? programs[0] ?? null;
  const header = (
    <PageHeader eyebrow="RF14" title="Relatórios"
      description="Relatório semanal ou mensal com data de corte e metodologia, pronto para imprimir/salvar em PDF, e exportações CSV. Tudo respeita as suas permissões."
      actions={<PrintButton />} />
  );
  if (!program) return <>{header}<EmptyState title="Nenhum programa no seu escopo" /></>;
  const periodicity: Periodicity = one(sp.periodo) === "semanal" ? "semanal" : "mensal";
  const { cutoff, start, end } = reportPeriod(periodicity, one(sp.corte));
  const kind = program.competition?.kind;
  const canBudget = hasRole(access, program.id, "supervisao", "gestao");
  const generatedAt = new Date();
  const csv = (tipo: string) => `/relatorios/csv?${new URLSearchParams({ programa: program.id, tipo, periodo: periodicity, corte: cutoff })}`;

  const [{ data: actions }, { data: teams }, { data: risks }, { data: requests }, { data: reports }] = await Promise.all([
    supabase.from("actions_view").select("id, title, status, due_date, completed_at, created_at").eq("program_id", program.id).is("archived_at", null),
    supabase.from("teams").select("id, name").eq("program_id", program.id).is("archived_at", null).order("name"),
    supabase.from("risks").select("id, title, score, status, next_review").eq("program_id", program.id).is("archived_at", null).neq("status", "fechado").order("score", { ascending: false }),
    supabase.from("resource_requests").select("id, title, status, blocking, needed_by").eq("program_id", program.id).in("status", ["enviada", "em_analise", "aprovada"]),
    supabase.from("weekly_reports").select("team_id, week_start, version, status").eq("program_id", program.id).gte("week_start", addDays(start, -6)).lte("week_start", end),
  ]);
  const acts = actions ?? [];
  const overdueAtCutoff = acts.filter((a) => a.due_date && a.due_date < cutoff && a.status !== "concluida" && a.status !== "cancelada");
  const createdIn = acts.filter((a) => a.created_at && a.created_at.slice(0, 10) >= start && a.created_at.slice(0, 10) <= end).length;
  const completedIn = acts.filter((a) => a.completed_at && a.completed_at.slice(0, 10) >= start && a.completed_at.slice(0, 10) <= end).length;
  const teamName = new Map((teams ?? []).map((t) => [t.id, t.name]));

  let ws: { team: string; ch: ReturnType<typeof chTotal>; exec: ReturnType<typeof executionRate> }[] = [];
  if (kind === "worldskills") {
    const [{ allocations, attendance, nonWorking }, { data: items }] = await Promise.all([
      loadChData(supabase, program.id, start, end),
      supabase.from("training_items").select("due_date, status, plan:training_plans!inner(team_id, status)").eq("program_id", program.id).eq("plan.status", "publicado").gte("due_date", start).lte("due_date", end),
    ]);
    ws = (teams ?? []).map((t) => ({
      team: t.name,
      ch: chTotal(chByPerson(allocations, attendance, start, end, { teamId: t.id, nonWorking })),
      exec: executionRate((items ?? []).filter((i) => i.plan?.team_id === t.id), start, end),
    }));
  }
  let inova: { stage: string; n: number }[] = [];
  let results: { title: string; level: string; held_on: string; total: number | null; placement: number | null }[] = [];
  if (kind === "inova") {
    const { data: projects } = await supabase.from("projects").select("id, title, stage, results:project_results(level, held_on, total_score, placement)").eq("program_id", program.id).is("archived_at", null);
    inova = STAGES.map((s) => ({ stage: STAGE_LABEL[s], n: (projects ?? []).filter((p) => p.stage === s).length }));
    results = (projects ?? []).flatMap((p) => p.results.filter((r) => r.held_on >= start && r.held_on <= end).map((r) => ({ title: p.title, level: r.level, held_on: r.held_on, total: r.total_score === null ? null : Number(r.total_score), placement: r.placement })));
  }
  let budget: ReturnType<typeof summarize> | null = null;
  if (canBudget) {
    const { data: txs } = await supabase.from("budget_transactions").select("id, type, amount, parent_id, cancelled_at, occurred_on").eq("program_id", program.id).lte("occurred_on", cutoff);
    budget = summarize((txs ?? []).map((t) => ({ id: t.id, type: t.type, amount: Number(t.amount), parent_id: t.parent_id, cancelled_at: t.cancelled_at })));
  }

  return (
    <>
      {header}
      <form method="get" className="no-print mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4" aria-label="Parâmetros do relatório">
        <input type="hidden" name="programa" value={program.id} />
        <label className="text-sm"><span className="mb-1 block font-medium">Periodicidade</span>
          <select name="periodo" defaultValue={periodicity} className="h-10 rounded-md border border-slate-300 bg-white px-2"><option value="semanal">Semanal</option><option value="mensal">Mensal</option></select></label>
        <label className="text-sm"><span className="mb-1 block font-medium">Data de corte</span>
          <input type="date" name="corte" defaultValue={cutoff} className="h-10 rounded-md border border-slate-300 px-2" /></label>
        <button className="h-10 rounded-md bg-brand-700 px-4 text-sm font-medium text-white">Gerar</button>
        <div className="ml-auto"><ProgramPicker programs={programs.map((p) => ({ id: p.id, label: programLabel(p) }))} value={program.id} /></div>
      </form>

      <article className="space-y-6 rounded-lg border border-slate-200 bg-white p-6 print:border-0 print:p-0">
        <header className="border-b border-slate-200 pb-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent-700">COMPETE VIX · Relatório {periodicity}</p>
          <h2 className="text-xl font-bold text-brand-900">{programLabel(program)}</h2>
          <p className="text-sm text-slate-600">Período {formatDate(start)} a {formatDate(end)} · data de corte {formatDate(cutoff)} · gerado em {formatDateTime(generatedAt)} por {access.displayName}</p>
        </header>

        <Section title="Ações (RF05)" csv={csv("acoes")}>
          <div className="flex flex-wrap gap-2 text-sm">
            {STATUS_ORDER.map((s) => <Badge key={s}>{STATUS_LABEL[s]}: {acts.filter((a) => a.status === s).length}</Badge>)}
          </div>
          <p className="mt-2 text-sm">Criadas no período: <strong>{createdIn}</strong> · concluídas no período: <strong>{completedIn}</strong> · atrasadas na data de corte: <strong>{overdueAtCutoff.length}</strong></p>
          {overdueAtCutoff.length ? (
            <ul className="mt-2 list-disc pl-5 text-sm">{overdueAtCutoff.slice(0, 15).map((a) => <li key={a.id}>{a.title} — prazo {formatDate(a.due_date)}</li>)}</ul>
          ) : null}
        </Section>

        {kind === "worldskills" ? (
          <Section title="WorldSkills — CH e execução do plano (RF07)" csv={csv("ch")} extraCsv={[["Simulados", csv("simulados")]]}>
            {ws.length === 0 ? <p className="text-sm text-slate-600">Sem equipes.</p> : (
              <Table caption="CH por equipe">
                <thead><tr><Th>Equipe</Th><Th className="text-right">Previsto</Th><Th className="text-right">Efetivo</Th><Th className="text-right">CH (meta ≥ {CH_TARGET_PCT}%)</Th><Th className="text-right">Execução do plano</Th></tr></thead>
                <tbody>{ws.map((w) => (
                  <Tr key={w.team}><Td>{w.team}</Td><Td className="text-right">{formatMinutes(w.ch.planned)}</Td><Td className="text-right">{formatMinutes(w.ch.effective)}</Td>
                    <Td className="text-right">{formatPercent(w.ch.pct)}</Td><Td className="text-right">{formatPercent(w.exec.pct)}{w.exec.total ? ` (${w.exec.done}/${w.exec.total})` : ""}</Td></Tr>
                ))}</tbody>
              </Table>
            )}
          </Section>
        ) : null}

        <Section title="Fechamentos semanais (RF06)" csv={csv("fechamentos")}>
          {(reports ?? []).length === 0 ? <p className="text-sm text-slate-600">Sem fechamentos no período.</p> : (
            <ul className="text-sm">{(reports ?? []).map((r, i) => <li key={i}>{teamName.get(r.team_id) ?? "Equipe"} · semana {formatDate(r.week_start)} · v{r.version} · {REPORT_STATUS_LABEL[r.status]}</li>)}</ul>
          )}
        </Section>

        {kind === "inova" ? (
          <Section title="INOVA — funil e resultados no evento (RF08)">
            <div className="flex flex-wrap gap-2 text-sm">{inova.map((x) => <Badge key={x.stage}>{x.stage}: {x.n}</Badge>)}</div>
            {results.length ? <ul className="mt-2 text-sm">{results.map((r, i) => <li key={i}>{r.title} · {r.level} · {formatDate(r.held_on)}{r.placement ? ` · ${r.placement}º` : ""}{r.total !== null ? ` · nota ${r.total}` : ""}</li>)}</ul> : <p className="mt-2 text-sm text-slate-600">Sem resultados de evento no período.</p>}
          </Section>
        ) : null}

        <Section title="Riscos ativos (RF12)" csv={csv("riscos")}>
          {(risks ?? []).length === 0 ? <p className="text-sm text-slate-600">Sem riscos ativos.</p> : (
            <ul className="text-sm">{(risks ?? []).slice(0, 15).map((r) => <li key={r.id}>{r.title} — {RISK_LEVEL_LABEL[riskLevel(r.score ?? 0)]} ({r.score}){r.next_review && r.next_review < cutoff ? " · revisão vencida" : ""}</li>)}</ul>
          )}
        </Section>

        <Section title="Recursos pendentes (RF09)" csv={csv("solicitacoes")}>
          {(requests ?? []).length === 0 ? <p className="text-sm text-slate-600">Sem solicitações pendentes.</p> : (
            <ul className="text-sm">{(requests ?? []).map((r) => <li key={r.id}>{r.title} — {REQUEST_STATUS_LABEL[r.status]}{r.blocking ? " · BLOQUEANTE" : ""}{r.needed_by ? ` · até ${formatDate(r.needed_by)}` : ""}</li>)}</ul>
          )}
        </Section>

        {budget ? (
          <Section title="Orçamento até a data de corte (RF10)" csv={csv("orcamento")}>
            <p className="text-sm">Aprovado {formatBRL(budget.approved)} · compromissos em aberto {formatBRL(budget.openCommitments)} · realizado {formatBRL(budget.realized)} · <strong>saldo {formatBRL(budget.balance)}</strong></p>
          </Section>
        ) : null}

        <section className="border-t border-slate-200 pt-4 text-xs text-slate-600">
          <h3 className="mb-1 font-semibold text-slate-800">Metodologia</h3>
          <ul className="list-disc space-y-0.5 pl-4">
            <li>Período: semana seg–dom ou mês civil que contém a data de corte, limitado a ela. Fuso America/Sao_Paulo.</li>
            <li>Ações: situação atual no momento da geração; “atrasada” = prazo anterior à data de corte e não concluída/cancelada.</li>
            <li>CH = minutos efetivos de presença ÷ minutos previstos pelas alocações vigentes, rateadas por dia útil; previsto zero = N/A; feriados e recessos do Calendário são descontados.</li>
            <li>Execução do plano = itens concluídos ÷ itens com prazo no período (cancelados excluídos), apenas planos publicados.</li>
            <li>Orçamento: saldo = aprovado − compromissos ainda não realizados − realizado; lançamentos cancelados excluídos; realizado vinculado consome o compromisso.</li>
            <li>Riscos: pontuação = probabilidade × impacto (1–5); crítico ≥ 15.</li>
            <li>O conteúdo reflete as permissões de quem gerou o relatório. Os CSV trazem os dados brutos para reprodução dos indicadores.</li>
          </ul>
          <p className="mt-2">Gerado em {formatDateTime(generatedAt)} · consulta a partir de {zonedToUtc(start).toISOString().slice(0, 10)} (UTC).</p>
        </section>
      </article>
      <p className="no-print mt-4 text-xs text-slate-500"><Link href="/dashboard" className="text-brand-700 hover:underline">Voltar ao painel</Link></p>
    </>
  );
}

function Section({ title, csv, extraCsv = [], children }: { title: string; csv?: string; extraCsv?: [string, string][]; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-brand-900">{title}</h3>
        <span className="no-print flex gap-2">
          {csv ? <a href={csv} className={buttonClass("ghost", "sm")}><Download className="size-4" aria-hidden /> CSV</a> : null}
          {extraCsv.map(([l, h]) => <a key={h} href={h} className={buttonClass("ghost", "sm")}><Download className="size-4" aria-hidden /> {l}</a>)}
        </span>
      </div>
      {children}
    </section>
  );
}
