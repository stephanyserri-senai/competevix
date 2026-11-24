import Link from "next/link";
import type { Metadata } from "next";
import { CalendarPlus, Download, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { buttonClass } from "@/components/ui/button";
import { ProgramPicker } from "@/components/layout/program-picker";
import { hasRole, requireAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  addDays, addMonths, formatMonth, formatTime, formatWeekday, isValidLocalDate, startOfMonth, startOfWeek, todayLocal, zonedParts, zonedToUtc, formatDate,
} from "@/lib/dates";
import { listPrograms, pickProgram, programLabel } from "@/features/programas/queries";
import { listPeopleOptions } from "@/features/equipes/queries";
import { loadAgenda } from "@/features/agenda/queries";
import { detectConflicts, expandAll, EVENT_TYPE_LABEL, type Occurrence } from "@/features/agenda/domain";
import { EventForm } from "@/features/agenda/event-form";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Agenda" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function AgendaPage({ searchParams }: PageProps<"/agenda">) {
  const sp = await searchParams;
  const access = await requireAccess();
  const supabase = await createClient();
  const programs = await listPrograms(supabase);
  const program = pickProgram(programs, sp.programa) ?? programs[0] ?? null;
  const header = <PageHeader eyebrow="RF04" title="Agenda" description="Visões mensal e semanal, eventos recorrentes com exceções, responsáveis, participantes e conflitos de horário. Horários em America/Sao_Paulo." />;
  if (!program) return <>{header}<EmptyState title="Nenhum programa no seu escopo" /></>;

  const view = one(sp.visao) === "semana" ? "semana" : "mes";
  const today = todayLocal();
  const ref = isValidLocalDate(one(sp.data)) ? one(sp.data) : today;
  const teamFilter = one(sp.equipe) || null;
  const gridStart = view === "mes" ? startOfWeek(startOfMonth(ref)) : startOfWeek(ref);
  const days = view === "mes" ? 42 : 7;
  const rangeStart = zonedToUtc(gridStart);
  const rangeEnd = zonedToUtc(addDays(gridStart, days));

  const [{ events, exceptions }, { data: teams }, people] = await Promise.all([
    loadAgenda(supabase, { programIds: [program.id], teamId: teamFilter, rangeStart, rangeEnd }),
    supabase.from("teams").select("id, name").eq("program_id", program.id).is("archived_at", null).order("name"),
    listPeopleOptions(supabase),
  ]);
  const occurrences = expandAll(events, exceptions, rangeStart, rangeEnd);
  const personName = new Map(people.map((p) => [p.id, p.full_name]));
  const conflicts = detectConflicts(occurrences, (id) => personName.get(id) ?? "pessoa vinculada");
  const conflictKeys = new Set(conflicts.flatMap((c) => [`${c.a.event.id}|${c.a.key}`, `${c.b.event.id}|${c.b.key}`]));
  const byDay = new Map<string, Occurrence[]>();
  for (const o of occurrences) {
    const d = zonedParts(o.start).date;
    byDay.set(d, [...(byDay.get(d) ?? []), o]);
  }

  const isSup = hasRole(access, program.id, "supervisao");
  const canCreate = isSup || hasRole(access, program.id, "orientador");
  const link = (over: Record<string, string>) => {
    const s = new URLSearchParams({ programa: program.id, visao: view, data: ref, ...(teamFilter ? { equipe: teamFilter } : {}), ...over });
    return `/agenda?${s.toString()}`;
  };
  const prev = view === "mes" ? addMonths(startOfMonth(ref), -1) : addDays(ref, -7);
  const next = view === "mes" ? addMonths(startOfMonth(ref), 1) : addDays(ref, 7);
  const title = view === "mes" ? formatMonth(startOfMonth(ref)) : `Semana de ${formatDate(gridStart)} a ${formatDate(addDays(gridStart, 6))}`;

  return (
    <>
      {header}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <ProgramPicker programs={programs.map((p) => ({ id: p.id, label: programLabel(p) }))} value={program.id} />
        <div className="flex flex-wrap items-center gap-2">
          <form method="get" className="flex items-end gap-2">
            <input type="hidden" name="programa" value={program.id} />
            <input type="hidden" name="visao" value={view} />
            <input type="hidden" name="data" value={ref} />
            <label className="text-sm"><span className="sr-only">Equipe</span>
              <select name="equipe" defaultValue={teamFilter ?? ""} className="h-10 rounded-md border border-slate-300 bg-white px-2 text-sm">
                <option value="">Todas as equipes</option>
                {(teams ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <button className={buttonClass("secondary")}>Filtrar</button>
          </form>
          <a href={`/agenda/ics?programa=${program.id}${teamFilter ? `&equipe=${teamFilter}` : ""}`} className={buttonClass("secondary")}>
            <Download className="size-4" aria-hidden /> Exportar ICS
          </a>
          {canCreate ? <a href="#novo-evento" className={buttonClass("primary")}><CalendarPlus className="size-4" aria-hidden /> Novo evento</a> : null}
        </div>
      </div>

      <Card className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <Link href={link({ data: prev })} className={buttonClass("secondary", "sm")} aria-label="Período anterior">←</Link>
            <Link href={link({ data: today })} className={buttonClass("secondary", "sm")}>Hoje</Link>
            <Link href={link({ data: next })} className={buttonClass("secondary", "sm")} aria-label="Próximo período">→</Link>
            <h2 className="ml-2 text-lg font-semibold text-brand-900">{title}</h2>
          </div>
          <nav aria-label="Visão" className="flex rounded-md border border-slate-300 p-0.5">
            {(["mes", "semana"] as const).map((v) => (
              <Link key={v} href={link({ visao: v })} aria-current={view === v ? "page" : undefined}
                className={cn("rounded px-3 py-1 text-sm", view === v ? "bg-brand-700 text-white" : "text-slate-700 hover:bg-slate-100")}>
                {v === "mes" ? "Mensal" : "Semanal"}
              </Link>
            ))}
          </nav>
        </div>

        {view === "mes" ? (
          <div className="overflow-x-auto">
            <div className="grid min-w-[720px] grid-cols-7 border-l border-slate-100" role="grid" aria-label={title}>
              {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => (
                <div key={d} role="columnheader" className="border-b border-r border-slate-100 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600">{d}</div>
              ))}
              {Array.from({ length: days }).map((_, i) => {
                const d = addDays(gridStart, i);
                const inMonth = d.slice(0, 7) === ref.slice(0, 7);
                const items = byDay.get(d) ?? [];
                return (
                  <div key={d} role="gridcell" aria-label={formatDate(d)} className={cn("min-h-28 border-b border-r border-slate-100 p-1.5", !inMonth && "bg-slate-50/60", d === today && "bg-accent-50")}>
                    <p className={cn("mb-1 text-xs", inMonth ? "text-slate-700" : "text-slate-400", d === today && "font-bold text-accent-700")}>{Number(d.slice(8))}</p>
                    <ul className="space-y-1">
                      {items.slice(0, 4).map((o) => <OccurrenceChip key={o.event.id + o.key} o={o} conflict={conflictKeys.has(`${o.event.id}|${o.key}`)} />)}
                      {items.length > 4 ? <li className="text-[11px] text-slate-600">+{items.length - 4} evento(s)</li> : null}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {Array.from({ length: 7 }).map((_, i) => {
              const d = addDays(gridStart, i);
              const items = byDay.get(d) ?? [];
              return (
                <li key={d} className={cn("grid gap-2 px-4 py-3 sm:grid-cols-[140px_1fr]", d === today && "bg-accent-50")}>
                  <p className="text-sm font-semibold capitalize text-slate-800">{formatWeekday(d)} {formatDate(d)}</p>
                  {items.length === 0 ? <p className="text-sm text-slate-500">Sem eventos.</p> : (
                    <ul className="space-y-1.5">{items.map((o) => <OccurrenceChip key={o.event.id + o.key} o={o} conflict={conflictKeys.has(`${o.event.id}|${o.key}`)} wide />)}</ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card className="mb-6">
        <CardHeader title="Conflitos de horário no período" description="Sobreposição com mesma pessoa (responsável/participante) ou mesma equipe." />
        <CardBody>
          {conflicts.length === 0 ? (
            <p className="text-sm text-slate-600">Nenhum conflito entre os eventos visíveis neste período.</p>
          ) : (
            <ul className="space-y-2">
              {conflicts.map((c, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
                  <span>
                    <Link href={`/agenda/${c.a.event.id}`} className="font-medium text-brand-700 hover:underline">{c.a.title}</Link> ({formatDate(zonedParts(c.a.start).date)} {formatTime(c.a.start)}) ×{" "}
                    <Link href={`/agenda/${c.b.event.id}`} className="font-medium text-brand-700 hover:underline">{c.b.title}</Link> ({formatTime(c.b.start)}) — {c.reasons.join(", ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-slate-500">Considera apenas eventos que você pode ver. Ambientes/recursos entram na etapa 4 (RF09).</p>
        </CardBody>
      </Card>

      {canCreate ? (
        <Card>
          <CardHeader id="novo-evento" title="Novo evento" description={isSup ? undefined : "Orientadores criam eventos das equipes que orientam."} />
          <CardBody>
            {(teams ?? []).length === 0 && !isSup ? <Alert tone="info">Você não orienta equipes neste programa.</Alert> : (
              <EventForm
                programId={program.id}
                teams={(teams ?? []).map((t) => ({ id: t.id, name: t.name }))}
                people={people.map((p) => ({ id: p.id, name: p.full_name }))}
                allowGeneral={isSup}
                defaultDate={ref}
              />
            )}
          </CardBody>
        </Card>
      ) : null}
    </>
  );
}

function OccurrenceChip({ o, conflict, wide }: { o: Occurrence; conflict: boolean; wide?: boolean }) {
  return (
    <li>
      <Link
        href={`/agenda/${o.event.id}`}
        title={`${o.title} — ${EVENT_TYPE_LABEL[o.event.type ?? "outro"]}${conflict ? " (conflito)" : ""}`}
        className={cn(
          "block truncate rounded border-l-4 px-1.5 py-0.5 text-[11px] hover:bg-brand-50",
          conflict ? "border-amber-500 bg-amber-50" : "border-brand-500 bg-brand-50/60",
          wide && "text-sm",
        )}
      >
        <span className="font-semibold">{formatTime(o.start)}</span> {o.title}
        {o.modified ? <span className="ml-1 text-slate-500">(alterada)</span> : null}
        {conflict ? <span className="sr-only"> — conflito de horário</span> : null}
      </Link>
    </li>
  );
}
