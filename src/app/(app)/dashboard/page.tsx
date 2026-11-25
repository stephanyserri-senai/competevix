import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Clock, Hourglass, ListTodo, Lock, Target } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { requireAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addDays, formatDate, formatDateTime, todayLocal } from "@/lib/dates";
import { listPrograms } from "@/features/programas/queries";
import { listPeopleOptions } from "@/features/equipes/queries";
import { formatPercent } from "@/features/dashboard/domain";
import { THEME_LABEL, byGroup, kpis, weekly, type BiAction, type Stage, type Theme } from "@/features/bi/domain";
import { SingleBars, StackedByGroup, WeeklyLines } from "@/features/bi/components/charts";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Painel" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const PERIODS = { "7": "7 dias", "30": "30 dias", "90": "90 dias" } as const;

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const sp = await searchParams;
  const access = await requireAccess();
  const supabase = await createClient();
  const programs = (await listPrograms(supabase)).filter((p) => (access.roles[p.id] ?? []).some((r) => ["supervisao", "gestao", "orientador", "competidor"].includes(r)));
  const first = access.displayName.replace(/^\[DEMO\]\s*/, "").split(" ")[0];

  if (!programs.length) {
    return (
      <>
        <PageHeader title={`Olá, ${first}`} />
        <EmptyState title="Sem vínculo com frentes">
          {access.isAdmin ? "Como administrador(a), você gerencia usuários e configurações. Para acompanhar ações, crie para você um vínculo de supervisão em Configurações." : "Seu acesso ainda não foi vinculado a uma frente. Procure a supervisão."}
        </EmptyState>
      </>
    );
  }

  const fComp = one(sp.frente);
  const fUnit = one(sp.unidade);
  const period = (one(sp.periodo) in PERIODS ? one(sp.periodo) : "30") as keyof typeof PERIODS;
  const today = todayLocal();
  const start = addDays(today, -Number(period) + 1);
  const comps = [...new Map(programs.map((p) => [p.competition_id, p.competition?.name ?? ""])).entries()];
  const units = [...new Map(programs.map((p) => [p.unit_id, p.unit?.name ?? ""])).entries()];
  const selected = programs.filter((p) => (!fComp || p.competition_id === fComp) && (!fUnit || p.unit_id === fUnit));
  const ids = selected.map((p) => p.id);

  const [{ data }, people] = await Promise.all([
    supabase.from("actions_view")
      .select("id, title, stage, due_date, created_at, completed_at, is_overdue, completed_on_time, blocked, blocked_reason, competition_id, unit_id, program_id, owner_person_id, theme")
      .in("program_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"])
      .is("archived_at", null)
      .limit(5000),
    listPeopleOptions(supabase),
  ]);
  const rows = (data ?? []) as (BiAction & { title: string; program_id: string; unit_id: string; blocked_reason: string | null })[];
  const personName = new Map(people.map((p) => [p.id, p.full_name.replace(/^\[DEMO\]\s*/, "")]));
  const compName = new Map(comps);
  const unitShort = (id: string) => (units.find(([u]) => u === id)?.[1] ?? "").replace(/^SENAI Vitória — /, "");
  const k = kpis(rows, start, today);
  const byFront = byGroup(rows, (a) => `${a.competition_id}|${a.unit_id}`, (key) => {
    const [c, u] = key.split("|");
    return `${compName.get(c) ?? ""} · ${unitShort(u)}`;
  });
  const byTheme = byGroup(rows.filter((a) => a.stage !== "concluida"), (a) => a.theme, (t) => THEME_LABEL[t as Theme] ?? t, "Sem tema");
  const byOwner = byGroup(rows, (a) => a.owner_person_id, (id) => personName.get(id) ?? "Pessoa", "Sem responsável").slice(0, 10);
  const weeks = weekly(rows, 12, today).map((w) => ({ ...w, label: formatDate(w.week).slice(0, 5) }));
  const attention = rows
    .filter((a) => a.is_overdue || (a.blocked && a.stage !== "concluida") || a.stage === "em_validacao")
    .sort((a, b) => Number(b.is_overdue) - Number(a.is_overdue) || (a.due_date ?? "9").localeCompare(b.due_date ?? "9"))
    .slice(0, 8);
  const link = (over: Record<string, string>) => `/dashboard?${new URLSearchParams({ frente: fComp, unidade: fUnit, periodo: period, ...over })}`;
  const hasRows = rows.length > 0;

  return (
    <>
      <PageHeader
        title={`Olá, ${first}`}
        description={`Acompanhamento das ações · dados de ${formatDateTime(new Date())}`}
        actions={<Link href="/acoes" className="inline-flex h-10 items-center rounded-xl bg-brand-700 px-4 text-sm font-medium text-white shadow-sm hover:bg-brand-800">Abrir quadro de ações</Link>}
      />

      <form method="get" className="mb-6 flex flex-wrap items-center gap-2" aria-label="Filtros do painel">
        <select name="frente" defaultValue={fComp} aria-label="Frente" className="h-9 rounded-full border border-slate-200 bg-white px-3 text-sm shadow-sm">
          <option value="">Todas as frentes</option>
          {comps.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <select name="unidade" defaultValue={fUnit} aria-label="Unidade" className="h-9 rounded-full border border-slate-200 bg-white px-3 text-sm shadow-sm">
          <option value="">Todas as unidades</option>
          {units.map(([id, name]) => <option key={id} value={id}>{name.replace(/^SENAI Vitória — /, "")}</option>)}
        </select>
        <input type="hidden" name="periodo" value={period} />
        <button className="h-9 rounded-full bg-slate-900 px-4 text-sm font-medium text-white">Aplicar</button>
        <nav aria-label="Período" className="ml-auto flex rounded-full border border-slate-200 bg-white p-0.5 shadow-sm">
          {Object.entries(PERIODS).map(([v, l]) => (
            <Link key={v} href={link({ periodo: v })} aria-current={period === v ? "page" : undefined}
              className={cn("rounded-full px-3 py-1.5 text-sm", period === v ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100")}>{l}</Link>
          ))}
        </nav>
      </form>

      <section aria-label="Indicadores" className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi icon={ListTodo} tone="brand" label="Em aberto" value={hasRows ? k.active : null} hint={k.withoutOwner ? `${k.withoutOwner} sem responsável` : "todas com responsável"} href="/acoes" />
        <Kpi icon={CheckCircle2} tone="emerald" label={`Concluídas (${PERIODS[period]})`} value={hasRows ? k.completedInPeriod : null} hint="aprovadas pela supervisão" href="/acoes?visao=lista" />
        <Kpi icon={Target} tone="brand" label="No prazo" value={k.onTimePct === null ? null : formatPercent(k.onTimePct)} hint={k.onTimeBase ? `de ${k.onTimeBase} concluídas com prazo` : "sem concluídas com prazo"} />
        <Kpi icon={Clock} tone="red" label="Atrasadas" value={hasRows ? k.overdue : null} hint="prazo vencido" href="/acoes?atrasadas=1" />
        <Kpi icon={Hourglass} tone="accent" label="Em validação" value={hasRows ? k.inValidation : null} hint="aguardando supervisão" href="/acoes" />
        <Kpi icon={Lock} tone="amber" label="Bloqueadas" value={hasRows ? k.blocked : null} hint="com impedimento" href="/acoes" />
      </section>

      {!hasRows ? (
        <EmptyState title="Ainda não há ações nestas frentes" action={<Link href="/acoes" className="text-sm font-medium text-brand-700 hover:underline">Criar a primeira ação →</Link>}>
          Os gráficos aparecem assim que as ações forem registradas.
        </EmptyState>
      ) : (
        <div className="grid gap-6 xl:grid-cols-5">
          <Card className="xl:col-span-3">
            <CardHeader title="Por frente" description="Etapa das ações em cada frente (canceladas fora)." />
            <CardBody>
              <StackedByGroup data={byFront.map((g) => ({ label: g.label, concluida: g.concluida, em_andamento: g.em_andamento, em_validacao: g.em_validacao, a_fazer: g.a_fazer }))} height={Math.max(160, byFront.length * 48 + 60)} />
              <TableView caption="Ações por frente" head={["Frente", "Concluídas", "Em andamento", "Em validação", "A fazer", "Atrasadas"]}
                rows={byFront.map((g) => [g.label, g.concluida, g.em_andamento, g.em_validacao, g.a_fazer, g.overdue])} />
            </CardBody>
          </Card>

          <Card className="xl:col-span-2">
            <CardHeader title="Precisa de atenção" description="Atrasadas, bloqueadas e aguardando validação." />
            <CardBody>
              {attention.length === 0 ? <p className="text-sm text-slate-500">Nada pendente. 🎉</p> : (
                <ul className="divide-y divide-slate-100">
                  {attention.map((a) => (
                    <li key={a.id} className="py-2.5">
                      <Link href={`/acoes/${a.id}`} className="block text-sm font-medium text-slate-800 hover:text-brand-700">{a.title}</Link>
                      <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs">
                        {a.is_overdue ? <span className="inline-flex items-center gap-1 font-semibold text-red-700"><Clock className="size-3" aria-hidden /> venceu {formatDate(a.due_date)}</span> : null}
                        {a.blocked && a.stage !== "concluida" ? <span className="inline-flex items-center gap-1 font-semibold text-amber-700"><AlertTriangle className="size-3" aria-hidden /> bloqueada</span> : null}
                        {a.stage === "em_validacao" ? <span className="inline-flex items-center gap-1 font-semibold text-accent-700"><Hourglass className="size-3" aria-hidden /> em validação</span> : null}
                        <span className="text-slate-500">{a.owner_person_id ? personName.get(a.owner_person_id) : "sem responsável"}</span>
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card className="xl:col-span-3">
            <CardHeader title="Evolução semanal" description="Ações criadas × concluídas nas últimas 12 semanas." />
            <CardBody>
              <WeeklyLines data={weeks} />
              <TableView caption="Ações por semana" head={["Semana", "Criadas", "Concluídas"]} rows={weeks.map((w) => [formatDate(w.week), w.criadas, w.concluidas])} />
            </CardBody>
          </Card>

          <Card className="xl:col-span-2">
            <CardHeader title="Por tema" description="Ações em aberto por tema." />
            <CardBody>
              {byTheme.length === 0 ? <p className="text-sm text-slate-500">Nenhuma ação em aberto.</p> : (
                <>
                  <SingleBars data={byTheme.map((g) => ({ label: g.label, value: g.total }))} height={Math.max(140, byTheme.length * 36 + 30)} />
                  <TableView caption="Ações em aberto por tema" head={["Tema", "Em aberto", "Atrasadas"]} rows={byTheme.map((g) => [g.label, g.total, g.overdue])} />
                </>
              )}
            </CardBody>
          </Card>

          <Card className="xl:col-span-5">
            <CardHeader title="Por responsável" description="Quem está com quais ações (as 10 pessoas com mais ações)." />
            <CardBody>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <caption className="sr-only">Ações por responsável</caption>
                  <thead><tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                    <th scope="col" className="py-2 pr-4 font-medium">Responsável</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Andamento</th>
                    <th scope="col" className="py-2 pr-4 text-right font-medium">Concluídas</th>
                    <th scope="col" className="py-2 pr-4 text-right font-medium">Em aberto</th>
                    <th scope="col" className="py-2 text-right font-medium">Atrasadas</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {byOwner.map((g) => {
                      const open = g.a_fazer + g.em_andamento + g.em_validacao;
                      const pct = g.total ? (g.concluida / g.total) * 100 : 0;
                      return (
                        <tr key={g.key}>
                          <td className="py-2.5 pr-4 font-medium text-slate-800">
                            {g.key === "__none" ? <span className="text-slate-500">Sem responsável</span> : <Link href={`/acoes?responsavel=${g.key}`} className="hover:text-brand-700">{g.label}</Link>}
                          </td>
                          <td className="w-1/3 py-2.5 pr-4">
                            <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`${Math.round(pct)}% concluídas`}>
                              <div className="h-full rounded-full bg-[#2a78d6]" style={{ width: `${pct}%` }} />
                            </div>
                          </td>
                          <td className="py-2.5 pr-4 text-right tabular-nums">{g.concluida}</td>
                          <td className="py-2.5 pr-4 text-right tabular-nums">{open}</td>
                          <td className={cn("py-2.5 text-right tabular-nums", g.overdue ? "font-semibold text-red-700" : "text-slate-400")}>{g.overdue}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>
        </div>
      )}
      <p className="mt-6 text-xs text-slate-400">
        “No prazo” = concluídas no período até a data do prazo ÷ concluídas no período que tinham prazo. Sem base, aparece “sem dados”. Detalhes por competição (CH, simulados, funil INOVA) ficam em “Mais módulos”.
      </p>
    </>
  );
}

const TONES = {
  brand: "bg-brand-50 text-brand-700", emerald: "bg-emerald-50 text-emerald-700", red: "bg-red-50 text-red-700",
  accent: "bg-accent-50 text-accent-700", amber: "bg-amber-50 text-amber-700",
} as const;

function Kpi({ icon: Icon, label, value, hint, tone, href }: { icon: typeof Clock; label: string; value: number | string | null; hint: string; tone: keyof typeof TONES; href?: string }) {
  const body = (
    <Card className="h-full transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex h-full flex-col gap-3 p-5">
        <span className={cn("grid size-10 place-items-center rounded-xl", TONES[tone])}><Icon className="size-5" aria-hidden /></span>
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          <p className="text-3xl font-bold tracking-tight text-slate-900 tabular-nums">{value === null ? <span className="text-lg font-semibold text-slate-400">Sem dados</span> : value}</p>
        </div>
        <p className="mt-auto text-xs text-slate-400">{hint}</p>
      </div>
    </Card>
  );
  return href ? <Link href={href} className="block rounded-2xl">{body}</Link> : body;
}

function TableView({ caption, head, rows }: { caption: string; head: string[]; rows: (string | number)[][] }): ReactNode {
  return (
    <details className="mt-2 text-sm">
      <summary className="cursor-pointer text-xs text-slate-500 hover:text-brand-700">Ver em tabela</summary>
      <table className="mt-2 w-full text-left text-xs">
        <caption className="sr-only">{caption}</caption>
        <thead><tr>{head.map((h) => <th key={h} scope="col" className="py-1 pr-3 font-medium text-slate-500">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-slate-100">{r.map((c, j) => <td key={j} className="py-1 pr-3 tabular-nums">{c}</td>)}</tr>)}</tbody>
      </table>
    </details>
  );
}

export type { Stage };
