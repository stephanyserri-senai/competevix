import Link from "next/link";
import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { ActionForm } from "@/components/ui/action-form";
import { TextField } from "@/components/ui/field-errors";
import { ProgramPicker } from "@/components/layout/program-picker";
import { hasRole, requireAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addDays, formatDate, isValidLocalDate, startOfWeek, todayLocal } from "@/lib/dates";
import { listPrograms, pickProgram, programLabel } from "@/features/programas/queries";
import { loadChData } from "@/features/worldskills/queries";
import { REPORT_STATUS_LABEL, chByPerson, chTotal, formatMinutes } from "@/features/worldskills/domain";
import { saveWeeklyReport } from "@/features/worldskills/actions";

export const metadata: Metadata = { title: "Acompanhamentos" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const TONE = { rascunho: "warning", enviado: "info", em_revisao: "brand", aprovado: "success", devolvido: "danger" } as const;

export default async function AcompanhamentosPage({ searchParams }: PageProps<"/acompanhamentos">) {
  const sp = await searchParams;
  const access = await requireAccess();
  const supabase = await createClient();
  const programs = await listPrograms(supabase);
  const program = pickProgram(programs, sp.programa) ?? programs[0] ?? null;
  const header = <PageHeader eyebrow="RF06" title="Acompanhamentos semanais" description="Planejamento e fechamento semanal por equipe: horas, resultados, dificuldades, intervenção e próximas entregas. A supervisão revisa, aprova ou devolve." />;
  if (!program) return <>{header}<EmptyState title="Nenhum programa no seu escopo" /></>;

  const today = todayLocal();
  // padrão: semana anterior (fechamento)
  const week = startOfWeek(isValidLocalDate(one(sp.semana)) ? one(sp.semana) : addDays(today, -7));
  const weekEnd = addDays(week, 6);
  const [{ data: teams }, { data: reports }, ch] = await Promise.all([
    supabase.from("teams").select("id, name").eq("program_id", program.id).is("archived_at", null).order("name"),
    supabase.from("weekly_reports").select("id, team_id, version, status, planned_minutes, actual_minutes, submitted_at").eq("program_id", program.id).eq("week_start", week).order("version", { ascending: false }),
    loadChData(supabase, program.id, week, weekEnd),
  ]);
  const canManage = hasRole(access, program.id, "supervisao") || hasRole(access, program.id, "orientador");
  const link = (w: string) => `/acompanhamentos?programa=${program.id}&semana=${w}`;

  return (
    <>
      {header}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <ProgramPicker programs={programs.map((p) => ({ id: p.id, label: programLabel(p) }))} value={program.id} />
        <div className="flex items-center gap-2 text-sm">
          <Link href={link(addDays(week, -7))} className="rounded-md border border-slate-300 bg-white px-3 py-1.5" aria-label="Semana anterior">←</Link>
          <span className="font-medium">Semana {formatDate(week)} – {formatDate(weekEnd)}</span>
          <Link href={link(addDays(week, 7))} className="rounded-md border border-slate-300 bg-white px-3 py-1.5" aria-label="Próxima semana">→</Link>
        </div>
      </div>
      {(teams ?? []).length === 0 ? <EmptyState title="Nenhuma equipe visível" /> : (
        <div className="grid gap-4 md:grid-cols-2">
          {(teams ?? []).map((t) => {
            const versions = (reports ?? []).filter((r) => r.team_id === t.id);
            const latest = versions[0];
            const suggested = chTotal(chByPerson(ch.allocations, ch.attendance, week, weekEnd, { teamId: t.id, nonWorking: ch.nonWorking }));
            return (
              <Card key={t.id}>
                <CardHeader title={t.name} actions={latest ? <Badge tone={TONE[latest.status]}>{REPORT_STATUS_LABEL[latest.status]}{latest.version > 1 ? ` · v${latest.version}` : ""}</Badge> : <Badge tone="danger">Não iniciado</Badge>} />
                <CardBody>
                  {latest ? (
                    <div className="space-y-1 text-sm">
                      <p>Horas: {formatMinutes(latest.actual_minutes)} de {formatMinutes(latest.planned_minutes)} previstas</p>
                      <Link href={`/acompanhamentos/${latest.id}`} className="font-medium text-brand-700 hover:underline">Abrir relatório →</Link>
                    </div>
                  ) : canManage ? (
                    <ActionForm action={saveWeeklyReport} schema="weeklyReport" submitLabel="Iniciar fechamento" submitVariant="secondary" className="space-y-3">
                      <input type="hidden" name="program_id" value={program.id} />
                      <input type="hidden" name="team_id" value={t.id} />
                      <input type="hidden" name="week_start" value={week} />
                      <div className="grid grid-cols-2 gap-3">
                        <TextField id={`p-${t.id}`} name="planned_hours" type="number" step="0.5" min={0} label="Horas previstas" defaultValue={Math.round((suggested.planned / 60) * 10) / 10} />
                        <TextField id={`a-${t.id}`} name="actual_hours" type="number" step="0.5" min={0} label="Horas realizadas" defaultValue={Math.round((suggested.effective / 60) * 10) / 10} />
                      </div>
                      <p className="text-xs text-slate-500">Valores sugeridos a partir das alocações e presenças registradas; ajuste se necessário.</p>
                    </ActionForm>
                  ) : <p className="text-sm text-slate-600">Relatório ainda não iniciado.</p>}
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
