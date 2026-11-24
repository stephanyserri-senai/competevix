import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { ButtonLink } from "@/components/ui/button";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { ActionForm } from "@/components/ui/action-form";
import { SelectField, TextField, TextareaField } from "@/components/ui/field-errors";
import { ArchiveButton } from "@/components/ui/archive-button";
import { hasRole, requireAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, todayLocal } from "@/lib/dates";
import { addTeamMember, endTeamMember, saveTeam } from "@/features/equipes/actions";
import { isCurrent, listPeopleOptions } from "@/features/equipes/queries";
import { setArchived } from "@/features/programas/actions";
import { PERSON_KIND_LABEL, TEAM_ROLE_LABEL } from "@/features/labels";
import { programLabel } from "@/features/programas/queries";

export default async function EquipePage({ params }: PageProps<"/equipes/[id]">) {
  const { id } = await params;
  const access = await requireAccess();
  const supabase = await createClient();
  const { data: team } = await supabase
    .from("teams")
    .select("*, program:programs(id, unit_id, competition:competitions(name), cycle:cycles(name), unit:units(name)), occupation:occupations(code, name)")
    .eq("id", id)
    .maybeSingle();
  if (!team || !team.program) notFound();

  const [{ data: members }, people, { data: occupations }] = await Promise.all([
    supabase.from("team_members").select("*, person:people(full_name, kind)").eq("team_id", id).order("valid_from", { ascending: false }),
    listPeopleOptions(supabase),
    supabase.from("occupations").select("id, code, name").eq("program_id", team.program_id).is("archived_at", null),
  ]);
  const canManage = hasRole(access, team.program_id, "supervisao");
  const today = todayLocal();
  const current = (members ?? []).filter((m) => isCurrent(m, today));
  const history = (members ?? []).filter((m) => !isCurrent(m, today));

  return (
    <>
      <PageHeader
        eyebrow={programLabel(team.program)}
        title={team.name}
        description={team.occupation ? `${team.occupation.code} — ${team.occupation.name}` : "Sem ocupação vinculada"}
        actions={
          <>
            <ButtonLink href={`/acoes?programa=${team.program_id}&equipe=${id}`}>Ações da equipe</ButtonLink>
            {canManage ? <ArchiveButton archived={Boolean(team.archived_at)} onToggle={setArchived.bind(null, "teams", id, !team.archived_at, `/equipes/${id}`)} /> : null}
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Vínculos vigentes" description={`Data de referência: ${formatDate(today)}`} />
            <CardBody>
              {current.length === 0 ? <EmptyState title="Sem vínculos vigentes" /> : <MembersTable rows={current} canEnd={canManage} today={today} />}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Histórico e vínculos futuros" />
            <CardBody>
              {history.length === 0 ? <p className="text-sm text-slate-600">Sem registros.</p> : <MembersTable rows={history} canEnd={false} today={today} />}
            </CardBody>
          </Card>
        </div>
        {canManage ? (
          <div className="space-y-6">
            <Card>
              <CardHeader title="Novo vínculo" description="Competidor, suplente ou orientador (titular/reserva)." />
              <CardBody>
                <ActionForm action={addTeamMember} schema="teamMember" resetOnSuccess submitLabel="Vincular">
                  <input type="hidden" name="team_id" value={id} />
                  <input type="hidden" name="program_id" value={team.program_id} />
                  <SelectField name="person_id" label="Pessoa" required defaultValue="" hint="Cadastre antes em “Cadastro de pessoas”.">
                    <option value="" disabled>Selecione…</option>
                    {people.map((p) => <option key={p.id} value={p.id}>{p.full_name} ({PERSON_KIND_LABEL[p.kind]})</option>)}
                  </SelectField>
                  <SelectField name="role" label="Papel na equipe" defaultValue="competidor">
                    {Object.entries(TEAM_ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </SelectField>
                  <div className="grid grid-cols-2 gap-3">
                    <TextField name="valid_from" type="date" label="Início" defaultValue={today} required />
                    <TextField name="valid_to" type="date" label="Fim (opcional)" />
                  </div>
                  <TextField name="note" label="Observação" />
                </ActionForm>
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Dados da equipe" />
              <CardBody>
                <ActionForm action={saveTeam} schema="team">
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="program_id" value={team.program_id} />
                  <TextField name="name" label="Nome" defaultValue={team.name} required />
                  <SelectField name="occupation_id" label="Ocupação" defaultValue={team.occupation_id ?? ""}>
                    <option value="">Sem ocupação</option>
                    {(occupations ?? []).map((o) => <option key={o.id} value={o.id}>{o.code} — {o.name}</option>)}
                  </SelectField>
                  <TextareaField name="notes" label="Observações" defaultValue={team.notes ?? ""} />
                </ActionForm>
              </CardBody>
            </Card>
          </div>
        ) : null}
      </div>
    </>
  );
}

type MemberRow = {
  id: string;
  role: keyof typeof TEAM_ROLE_LABEL;
  valid_from: string;
  valid_to: string | null;
  note: string | null;
  person: { full_name: string; kind: keyof typeof PERSON_KIND_LABEL } | null;
};

function MembersTable({ rows, canEnd, today }: { rows: MemberRow[]; canEnd: boolean; today: string }) {
  return (
    <Table caption="Vínculos da equipe">
      <thead><tr><Th>Pessoa</Th><Th>Papel</Th><Th>Vigência</Th>{canEnd ? <Th>Encerrar</Th> : null}</tr></thead>
      <tbody>
        {rows.map((m) => (
          <Tr key={m.id}>
            <Td className="font-medium">{m.person?.full_name}{m.note ? <p className="text-xs font-normal text-slate-500">{m.note}</p> : null}</Td>
            <Td><Badge tone={m.role.startsWith("orientador") ? "brand" : "neutral"}>{TEAM_ROLE_LABEL[m.role]}</Badge></Td>
            <Td className="whitespace-nowrap text-xs">
              {formatDate(m.valid_from)} → {m.valid_to ? formatDate(m.valid_to) : "sem término"}
              {m.valid_from > today ? <Badge tone="info" className="ml-1">Futuro</Badge> : null}
            </Td>
            {canEnd ? (
              <Td>
                <ActionForm action={endTeamMember} schema="endTeamMember" submitLabel="Encerrar" submitVariant="secondary" className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="id" value={m.id} />
                  <TextField id={`end-${m.id}`} name="valid_to" type="date" label={<span className="sr-only">Data de término</span>} defaultValue={today} />
                </ActionForm>
              </Td>
            ) : null}
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}
