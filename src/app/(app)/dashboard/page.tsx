import Link from "next/link";
import type { Metadata } from "next";
import { AlertTriangle, CalendarClock, ClipboardList, Lock, Timer, Target } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { requireAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addDays, formatDate, formatDateTime, formatTime, todayLocal, zonedParts, zonedToUtc } from "@/lib/dates";
import { listPrograms, programLabel } from "@/features/programas/queries";
import { loadAgenda } from "@/features/agenda/queries";
import { expandAll } from "@/features/agenda/domain";
import { STATUS_LABEL, STATUS_ORDER } from "@/features/acoes/domain";
import { StatusChart } from "@/features/dashboard/components/status-chart";
import { scoreDeviation } from "@/features/dashboard/domain";

export const metadata: Metadata = { title: "Painel" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const sp = await searchParams;
  const access = await requireAccess();
  const supabase = await createClient();
  const all = await listPrograms(supabase);
  // Programas com papel operacional (administração sem vínculo não vê dados operacionais — PRD §4)
  const operational = all.filter((p) =>
    (access.roles[p.id] ?? []).some((r) => ["supervisao", "gestao", "orientador", "competidor"].includes(r)),
  );

  const f = { ciclo: one(sp.ciclo), unidade: one(sp.unidade), competicao: one(sp.competicao) };
  const programs = operational.filter(
    (p) =>
      (!f.ciclo || p.cycle_id === f.ciclo) &&
      (!f.unidade || p.unit_id === f.unidade) &&
      (!f.competicao || p.competition_id === f.competicao),
  );
  const ids = programs.map((p) => p.id);
  const cutoff = new Date();
  const today = todayLocal(cutoff);
  const uniq = <T extends { id: string; name: string }>(xs: (T | null)[]) =>
    [...new Map(xs.filter((x): x is T => Boolean(x)).map((x) => [x.id, x])).values()];
  const cycles = uniq(operational.map((p) => p.cycle));
  const units = uniq(operational.map((p) => p.unit));
  const comps = uniq(operational.map((p) => p.competition));

  const header = (
    <PageHeader
      eyebrow="RF01"
      title={`Olá, ${access.displayName.split(" ")[0]}`}
      description="Visão consolidada das frentes autorizadas: metas, desvios, pendências e próximos eventos. Ausência de registro aparece como “sem dados”, nunca como zero."
    />
  );
  if (operational.length === 0) {
    return (
      <>
        {header}
        <EmptyState title="Sem vínculo operacional vigente">
          {access.isAdmin
            ? "Como administrador(a), você gerencia usuários e configurações, mas não tem acesso automático a dados operacionais. Use Configurações."
            : "Seu acesso ainda não foi vinculado a um programa. Procure a administração."}
        </EmptyState>
      </>
    );
  }

  const rangeEnd = zonedToUtc(addDays(today, 15));
  const [{ data: actionsData }, { data: runsData }, { data: occData }, agenda] = await Promise.all([
    supabase
      .from("actions_view")
      .select("id, title, status, due_date, is_overdue, program_id, priority")
      .in("program_id", ids)
      .is("archived_at", null)
      .limit(2000),
    supabase
      .from("checklist_runs")
      .select("id, period_end, status, program_id, template:checklist_templates(name), team:teams(name)")
      .in("program_id", ids)
      .eq("status", "aberto")
      .limit(500),
    supabase
      .from("occupations")
      .select("id, code, name, target_score, target_source, program_id")
      .in("program_id", ids)
      .is("archived_at", null)
      .order("code"),
    loadAgenda(supabase, { programIds: ids, rangeStart: cutoff, rangeEnd }),
  ]);
  const actions = actionsData ?? [];
  const runs = runsData ?? [];
  const occupations = occData ?? [];
  const upcoming = expandAll(agenda.events, agenda.exceptions, cutoff, rangeEnd).slice(0, 10);
  const programName = new Map(programs.map((p) => [p.id, programLabel(p)]));

  const open = actions.filter((a) => a.status !== "concluida" && a.status !== "cancelada");
  const overdue = open.filter((a) => a.is_overdue);
  const blocked = open.filter((a) => a.status === "bloqueada");
  const dueSoon = open.filter((a) => a.due_date && a.due_date >= today && a.due_date <= addDays(today, 7));
  const pendingRuns = runs.filter((r) => r.period_end < today);
  const noDueDate = open.filter((a) => !a.due_date).length;
  const statusData = STATUS_ORDER.map((s) => ({ label: STATUS_LABEL[s], value: actions.filter((a) => a.status === s).length }));
  const src = `corte ${formatDateTime(cutoff)}`;
  const hasActions = actions.length > 0;

  return (
    <>
      {header}
      <form method="get" className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4" aria-label="Filtros do painel">
        <Filter name="ciclo" label="Ciclo" value={f.ciclo} options={cycles.map((c) => [c.id, c.name])} />
        <Filter name="unidade" label="Unidade" value={f.unidade} options={units.map((u) => [u.id, u.name])} />
        <Filter name="competicao" label="Competição" value={f.competicao} options={comps.map((c) => [c.id, c.name])} />
        <button className="h-10 rounded-md bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-800">Aplicar</button>
        <Link href="/dashboard" className="pb-2 text-sm text-brand-700 hover:underline">Limpar</Link>
        <p className="ml-auto pb-2 text-xs text-slate-600">{programs.length} programa(s) · dados de {src}</p>
      </form>

      {programs.length === 0 ? (
        <EmptyState title="Nenhum programa com esses filtros" />
      ) : (
        <>
          <section aria-label="Indicadores" className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <Kpi icon={ClipboardList} label="Ações em aberto" value={hasActions ? open.length : null} detail={noDueDate ? `${noDueDate} sem prazo definido` : undefined} source={`ações não encerradas · ${src}`} href="/acoes" />
            <Kpi icon={AlertTriangle} label="Ações atrasadas" value={hasActions ? overdue.length : null} tone={overdue.length ? "danger" : undefined} source={`prazo anterior a hoje e não encerradas · ${src}`} href="/acoes?atrasadas=1" />
            <Kpi icon={Lock} label="Ações bloqueadas" value={hasActions ? blocked.length : null} tone={blocked.length ? "warning" : undefined} source={`status bloqueada · ${src}`} />
            <Kpi icon={Timer} label="Vencem em 7 dias" value={hasActions ? dueSoon.length : null} source={`prazo entre hoje e ${formatDate(addDays(today, 7))}`} />
            <Kpi icon={CalendarClock} label="Checklists pendentes" value={runs.length ? pendingRuns.length : null} tone={pendingRuns.length ? "warning" : undefined} detail={runs.length ? `${runs.length - pendingRuns.length} em aberto no prazo` : undefined} source={`período encerrado sem conclusão · ${src}`} href="/checklists" />
          </section>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader title="Metas e desvios" description="Metas por ocupação, com fonte declarada. O desvio exige nota comparável (simulados entram na etapa 2)." />
              <CardBody>
                {occupations.length === 0 ? (
                  <EmptyState title="Sem metas cadastradas">Nenhuma ocupação com meta nos programas filtrados.</EmptyState>
                ) : (
                  <Table caption="Metas e desvios por ocupação">
                    <thead>
                      <tr><Th>Ocupação</Th><Th>Programa</Th><Th className="text-right">Meta</Th><Th className="text-right">Nota comparável</Th><Th className="text-right">Desvio</Th></tr>
                    </thead>
                    <tbody>
                      {occupations.map((o) => {
                        const dev = scoreDeviation(null, o.target_score);
                        return (
                          <Tr key={o.id}>
                            <Td className="font-medium">{o.code} — {o.name}</Td>
                            <Td className="text-xs">{programName.get(o.program_id)}</Td>
                            <Td className="text-right" title={o.target_source ?? undefined}>
                              {o.target_score !== null ? Number(o.target_score).toLocaleString("pt-BR") : <span className="text-slate-500">sem meta</span>}
                            </Td>
                            <Td className="text-right text-slate-500">sem dados</Td>
                            <Td className="text-right text-slate-500">{dev === null ? "N/A" : dev}</Td>
                          </Tr>
                        );
                      })}
                    </tbody>
                  </Table>
                )}
                <p className="mt-3 flex items-start gap-1.5 text-xs text-slate-600">
                  <Target className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  Origem: cadastro de ocupações (passe o cursor sobre a meta para ver a fonte). Referências do infográfico exigem validação; não há conversão de escala.
                </p>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Ações por status" description={`Programas filtrados · ${src}`} />
              <CardBody>
                {!hasActions ? (
                  <EmptyState title="Sem ações registradas">Sem dados para exibir.</EmptyState>
                ) : (
                  <>
                    <StatusChart data={statusData} />
                    <details className="mt-2 text-sm">
                      <summary className="cursor-pointer text-brand-700">Ver em tabela</summary>
                      <table className="mt-2 w-full text-left text-sm">
                        <caption className="sr-only">Ações por status</caption>
                        <thead><tr><th scope="col">Status</th><th scope="col" className="text-right">Quantidade</th></tr></thead>
                        <tbody>{statusData.map((d) => <tr key={d.label}><td>{d.label}</td><td className="text-right">{d.value}</td></tr>)}</tbody>
                      </table>
                    </details>
                  </>
                )}
              </CardBody>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader title="Pendências" description="Ações atrasadas ou bloqueadas e checklists com período encerrado." />
              <CardBody>
                {overdue.length + blocked.length + pendingRuns.length === 0 ? (
                  <p className="text-sm text-slate-600">
                    {hasActions || runs.length ? "Nenhuma pendência nos registros existentes." : "Sem dados: não há ações nem checklists registrados."}
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {[...overdue, ...blocked.filter((b) => !b.is_overdue)].slice(0, 10).map((a) => (
                      <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                        <span>
                          <Link href={`/acoes/${a.id}`} className="font-medium text-brand-700 hover:underline">{a.title}</Link>{" "}
                          <span className="text-xs text-slate-500">· {programName.get(a.program_id ?? "")}</span>
                        </span>
                        {a.is_overdue ? <Badge tone="danger">Atrasada · prazo {formatDate(a.due_date)}</Badge> : <Badge tone="warning">Bloqueada</Badge>}
                      </li>
                    ))}
                    {pendingRuns.slice(0, 5).map((r) => (
                      <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                        <Link href={`/checklists/${r.id}`} className="font-medium text-brand-700 hover:underline">
                          {r.template?.name}{r.team ? ` — ${r.team.name}` : ""}
                        </Link>
                        <Badge tone="warning">Checklist pendente · fim {formatDate(r.period_end)}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Próximos eventos" description="Próximos 15 dias." />
              <CardBody>
                {upcoming.length === 0 ? (
                  <p className="text-sm text-slate-600">Sem eventos registrados no período.</p>
                ) : (
                  <ul className="space-y-2">
                    {upcoming.map((o) => (
                      <li key={o.event.id + o.key} className="text-sm">
                        <Link href={`/agenda/${o.event.id}`} className="font-medium text-brand-700 hover:underline">{o.title}</Link>
                        <p className="text-xs text-slate-600">{formatDate(zonedParts(o.start).date)} · {formatTime(o.start)}–{formatTime(o.end)}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          </div>
          <Alert tone="info" className="mt-6" title="Indicadores das próximas etapas">
            CH ≥ 95%, execução do plano, simulados e pontuação conforme rampa (WorldSkills) e bancas/funil (INOVA) serão calculados a partir dos registros das etapas 2 e 3, com denominador, período e fonte explícitos.
          </Alert>
        </>
      )}
    </>
  );
}

function Filter({ name, label, value, options }: { name: string; label: string; value: string; options: [string, string][] }) {
  return (
    <label className="text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      <select name={name} defaultValue={value} className="h-10 min-w-44 rounded-md border border-slate-300 bg-white px-2">
        <option value="">Todos</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

function Kpi({
  icon: Icon, label, value, detail, source, tone, href,
}: {
  icon: typeof Target; label: string; value: number | null; detail?: string; source: string; tone?: "danger" | "warning"; href?: string;
}) {
  const body = (
    <Card className="h-full">
      <div className="flex h-full flex-col gap-1 p-4">
        <p className="flex items-center gap-2 text-sm font-medium text-slate-700"><Icon className="size-4 text-brand-600" aria-hidden /> {label}</p>
        <p className={`text-3xl font-bold ${tone === "danger" ? "text-red-700" : tone === "warning" ? "text-amber-700" : "text-brand-900"}`}>
          {value === null ? <span className="text-lg font-semibold text-slate-500">Sem dados</span> : value}
        </p>
        {detail ? <p className="text-xs text-slate-600">{detail}</p> : null}
        <p className="mt-auto pt-1 text-[11px] text-slate-500">Origem: {source}</p>
      </div>
    </Card>
  );
  return href ? <Link href={href} className="block rounded-lg hover:ring-2 hover:ring-brand-200">{body}</Link> : body;
}
