import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { ActionForm } from "@/components/ui/action-form";
import { SelectField, TextField } from "@/components/ui/field-errors";
import { hasRole, requireAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatTime, todayLocal, zonedParts } from "@/lib/dates";
import { isCurrent } from "@/features/equipes/queries";
import { saveAttendance } from "@/features/worldskills/actions";
import { ATTENDANCE_LABEL, formatMinutes } from "@/features/worldskills/domain";
import { TEAM_ROLE_LABEL } from "@/features/labels";

export default async function SessaoPage({ params }: PageProps<"/worldskills/sessoes/[id]">) {
  const { id } = await params;
  const access = await requireAccess();
  const supabase = await createClient();
  const { data: s } = await supabase.from("training_sessions").select("*, team:teams(name), competency:competencies(name)").eq("id", id).maybeSingle();
  if (!s) notFound();
  const [{ data: members }, { data: att }] = await Promise.all([
    supabase.from("team_members").select("person_id, role, valid_from, valid_to, person:people(full_name)").eq("team_id", s.team_id),
    supabase.from("attendance").select("*").eq("session_id", id),
  ]);
  const day = zonedParts(s.starts_at).date;
  const current = (members ?? []).filter((m) => isCurrent(m, day));
  const byPerson = new Map((att ?? []).map((a) => [a.person_id, a]));
  const canEdit = hasRole(access, s.program_id, "supervisao") || hasRole(access, s.program_id, "orientador");
  const total = (att ?? []).reduce((sum, a) => sum + a.attended_minutes, 0);

  return (
    <>
      <PageHeader
        eyebrow={`Sessão · ${s.team?.name}`}
        title={`${formatDateTime(s.starts_at)} – ${formatTime(s.ends_at)}`}
        description={`Duração efetiva ${formatMinutes(s.actual_minutes)}${s.competency ? ` · ${s.competency.name}` : ""}${s.location ? ` · ${s.location}` : ""} · ${formatMinutes(total)} de presença registrada`}
        actions={<Link href={`/worldskills?programa=${s.program_id}&aba=sessoes&semana=${day}`} className="text-sm text-brand-700 hover:underline">← Sessões</Link>}
      />
      {current.length === 0 ? <EmptyState title="Equipe sem vínculos vigentes nesta data" /> : (
        <div className="grid gap-4 md:grid-cols-2">
          {current.map((m) => {
            const a = byPerson.get(m.person_id);
            return (
              <Card key={m.person_id}>
                <CardHeader
                  title={m.person?.full_name ?? "Pessoa"}
                  description={TEAM_ROLE_LABEL[m.role]}
                  actions={a ? <Badge tone={a.status === "presente" ? "success" : a.status === "parcial" ? "info" : "warning"}>{ATTENDANCE_LABEL[a.status]} · {formatMinutes(a.attended_minutes)}</Badge> : <Badge>Sem registro</Badge>}
                />
                <CardBody>
                  {a?.justification ? <p className="mb-2 text-xs text-slate-600">{a.justification}</p> : null}
                  {canEdit ? (
                    <ActionForm action={saveAttendance} schema="attendance" submitLabel="Salvar presença" submitVariant="secondary" className="grid gap-3 sm:grid-cols-2">
                      <input type="hidden" name="session_id" value={id} />
                      <input type="hidden" name="program_id" value={s.program_id} />
                      <input type="hidden" name="person_id" value={m.person_id} />
                      <SelectField id={`s-${m.person_id}`} name="status" label="Situação" defaultValue={a?.status ?? "presente"}>
                        {Object.entries(ATTENDANCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </SelectField>
                      <TextField id={`m-${m.person_id}`} name="attended_minutes" type="number" min={0} max={s.actual_minutes} label="Minutos (parcial)" defaultValue={a?.status === "parcial" ? a.attended_minutes : ""} />
                      <TextField id={`j-${m.person_id}`} name="justification" label="Justificativa" defaultValue={a?.justification ?? ""} className="sm:col-span-2" />
                    </ActionForm>
                  ) : null}
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
      <p className="mt-4 text-xs text-slate-500">Presente = duração efetiva integral. Cada pessoa tem um registro por sessão (sem dupla contagem). Referência: {todayLocal()}.</p>
    </>
  );
}
