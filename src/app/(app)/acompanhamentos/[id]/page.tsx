import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/feedback";
import { ActionForm } from "@/components/ui/action-form";
import { SelectField, TextField, TextareaField } from "@/components/ui/field-errors";
import { RunButton } from "@/components/ui/run-button";
import { hasRole, requireAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addDays, formatDate, formatDateTime } from "@/lib/dates";
import { changeReportStatus, correctReport, saveWeeklyReport } from "@/features/worldskills/actions";
import { REPORT_STATUS_LABEL, formatMinutes } from "@/features/worldskills/domain";
import { formatPercent } from "@/features/dashboard/domain";

export default async function RelatorioPage({ params }: PageProps<"/acompanhamentos/[id]">) {
  const { id } = await params;
  const access = await requireAccess();
  const supabase = await createClient();
  const { data: r } = await supabase.from("weekly_reports").select("*, team:teams(name)").eq("id", id).maybeSingle();
  if (!r) notFound();
  const { data: versions } = await supabase.from("weekly_reports").select("id, version, status").eq("team_id", r.team_id).eq("week_start", r.week_start).order("version");
  const isSup = hasRole(access, r.program_id, "supervisao");
  const canManage = isSup || hasRole(access, r.program_id, "orientador");
  const editable = canManage && (r.status === "rascunho" || r.status === "devolvido");
  const latest = (versions ?? []).at(-1)?.id === r.id;
  const ch = r.planned_minutes ? (r.actual_minutes / r.planned_minutes) * 100 : null;

  return (
    <>
      <PageHeader
        eyebrow={`Fechamento semanal · ${r.team?.name} · v${r.version}`}
        title={`Semana ${formatDate(r.week_start)} – ${formatDate(addDays(r.week_start, 6))}`}
        description={<span className="flex flex-wrap items-center gap-2"><Badge tone={r.status === "aprovado" ? "success" : r.status === "devolvido" ? "danger" : "info"}>{REPORT_STATUS_LABEL[r.status]}</Badge> CH informada: {formatPercent(ch)} ({formatMinutes(r.actual_minutes)} de {formatMinutes(r.planned_minutes)})</span>}
        actions={<Link href={`/acompanhamentos?programa=${r.program_id}&semana=${r.week_start}`} className="text-sm text-brand-700 hover:underline">← Acompanhamentos</Link>}
      />
      {r.status === "devolvido" && r.review_note ? <Alert tone="warning" className="mb-4" title="Devolvido pela supervisão">{r.review_note}</Alert> : null}
      {r.status === "aprovado" ? <Alert tone="success" className="mb-4">Aprovado em {formatDateTime(r.reviewed_at)}{r.review_note ? ` — ${r.review_note}` : ""}. Correções geram nova versão.</Alert> : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Conteúdo" />
          <CardBody>
            {editable ? (
              <ActionForm action={saveWeeklyReport} schema="weeklyReport" submitLabel="Salvar rascunho">
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="program_id" value={r.program_id} />
                <input type="hidden" name="team_id" value={r.team_id} />
                <input type="hidden" name="week_start" value={r.week_start} />
                <div className="grid grid-cols-2 gap-3">
                  <TextField name="planned_hours" type="number" step="0.5" min={0} label="Horas previstas" defaultValue={r.planned_minutes / 60} />
                  <TextField name="actual_hours" type="number" step="0.5" min={0} label="Horas realizadas" defaultValue={r.actual_minutes / 60} />
                </div>
                <TextareaField name="outcomes" label="Resultados da semana" defaultValue={r.outcomes ?? ""} hint="Obrigatório para enviar." />
                <TextareaField name="blockers" label="Dificuldades" defaultValue={r.blockers ?? ""} />
                <TextareaField name="intervention" label="Intervenção necessária" defaultValue={r.intervention ?? ""} />
                <TextareaField name="next_steps" label="Próximas entregas" defaultValue={r.next_steps ?? ""} hint="Obrigatório para enviar." />
              </ActionForm>
            ) : (
              <dl className="space-y-4 text-sm">
                {[["Resultados", r.outcomes], ["Dificuldades", r.blockers], ["Intervenção", r.intervention], ["Próximas entregas", r.next_steps]].map(([l, v]) => (
                  <div key={l}><dt className="font-semibold text-slate-800">{l}</dt><dd className="whitespace-pre-line text-slate-700">{v || "—"}</dd></div>
                ))}
              </dl>
            )}
          </CardBody>
        </Card>
        <div className="space-y-6">
          {editable ? (
            <Card>
              <CardHeader title="Enviar para revisão" />
              <CardBody>
                <ActionForm action={changeReportStatus} schema="reportStatus" submitLabel="Enviar" submitVariant="accent">
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="status" value="enviado" />
                  <p className="text-sm text-slate-600">Salve o rascunho antes de enviar.</p>
                </ActionForm>
              </CardBody>
            </Card>
          ) : null}
          {isSup && (r.status === "enviado" || r.status === "em_revisao") ? (
            <Card>
              <CardHeader title="Revisão da supervisão" />
              <CardBody>
                <ActionForm action={changeReportStatus} schema="reportStatus" submitLabel="Registrar">
                  <input type="hidden" name="id" value={id} />
                  <SelectField name="status" label="Decisão" defaultValue="aprovado">
                    {r.status === "enviado" ? <option value="em_revisao">Marcar em revisão</option> : null}
                    <option value="aprovado">Aprovar</option>
                    <option value="devolvido">Devolver para ajuste</option>
                  </SelectField>
                  <TextareaField name="note" label="Orientação / comentário" hint="Obrigatório para devolver." />
                </ActionForm>
              </CardBody>
            </Card>
          ) : null}
          {canManage && r.status === "aprovado" && latest ? (
            <RunButton variant="secondary" label="Criar correção (nova versão)" onRun={correctReport.bind(null, id)} confirm="Criar nova versão em rascunho? A aprovada é mantida no histórico." />
          ) : null}
          <Card>
            <CardHeader title="Versões e trâmite" />
            <CardBody className="space-y-2 text-sm">
              <ul>{(versions ?? []).map((v) => <li key={v.id}><Link href={`/acompanhamentos/${v.id}`} className={v.id === id ? "font-semibold" : "text-brand-700 hover:underline"}>v{v.version}</Link> — {REPORT_STATUS_LABEL[v.status]}</li>)}</ul>
              {r.submitted_at ? <p className="text-xs text-slate-600">Enviado em {formatDateTime(r.submitted_at)}</p> : null}
              {r.reviewed_at ? <p className="text-xs text-slate-600">Revisado em {formatDateTime(r.reviewed_at)}</p> : null}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
