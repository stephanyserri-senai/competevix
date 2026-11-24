import Link from "next/link";
import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { ButtonLink } from "@/components/ui/button";
import { ActionForm } from "@/components/ui/action-form";
import { SelectField, TextField, TextareaField } from "@/components/ui/field-errors";
import { ProgramPicker } from "@/components/layout/program-picker";
import { hasRole, requireAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { listPrograms, pickProgram, programLabel } from "@/features/programas/queries";
import { saveTeam } from "@/features/equipes/actions";
import { isCurrent } from "@/features/equipes/queries";
import { TEAM_ROLE_LABEL } from "@/features/labels";

export const metadata: Metadata = { title: "Equipes" };

export default async function EquipesPage({ searchParams }: PageProps<"/equipes">) {
  const sp = await searchParams;
  const access = await requireAccess();
  const supabase = await createClient();
  const programs = await listPrograms(supabase);
  const program = pickProgram(programs, sp.programa) ?? programs[0] ?? null;

  const header = (
    <PageHeader
      eyebrow="RF03"
      title="Equipes e pessoas"
      description="Vínculos de competidores, suplentes e orientadores (titulares e reservas) com vigência. Equipes podem ter vários competidores."
      actions={<ButtonLink href="/equipes/pessoas">Cadastro de pessoas</ButtonLink>}
    />
  );
  if (!program) {
    return <>{header}<EmptyState title="Nenhum programa no seu escopo">Peça à administração um vínculo com um programa.</EmptyState></>;
  }

  const [{ data: teams }, { data: occupations }] = await Promise.all([
    supabase
      .from("teams")
      .select("id, name, notes, archived_at, occupation:occupations(code, name), members:team_members(id, role, valid_from, valid_to, person:people(full_name))")
      .eq("program_id", program.id)
      .order("name"),
    supabase.from("occupations").select("id, code, name").eq("program_id", program.id).is("archived_at", null).order("code"),
  ]);
  const canManage = hasRole(access, program.id, "supervisao");

  return (
    <>
      {header}
      <div className="mb-6">
        <ProgramPicker programs={programs.map((p) => ({ id: p.id, label: programLabel(p) }))} value={program.id} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {(teams ?? []).length === 0 ? (
            <EmptyState title="Nenhuma equipe visível neste programa">
              {canManage ? "Cadastre a primeira equipe ao lado." : "Você vê apenas as equipes às quais está vinculado(a)."}
            </EmptyState>
          ) : (
            (teams ?? []).map((t) => {
              const current = t.members.filter((m) => isCurrent(m));
              return (
                <Card key={t.id} as="article">
                  <CardHeader
                    title={<Link href={`/equipes/${t.id}`} className="text-brand-800 hover:underline">{t.name}</Link>}
                    description={t.occupation ? `${t.occupation.code} — ${t.occupation.name}` : "Sem ocupação vinculada"}
                    actions={t.archived_at ? <Badge>Arquivada</Badge> : <Badge tone="brand">{current.length} vínculo(s) vigente(s)</Badge>}
                  />
                  <CardBody>
                    {current.length === 0 ? (
                      <p className="text-sm text-slate-600">Sem vínculos vigentes.</p>
                    ) : (
                      <ul className="flex flex-wrap gap-2">
                        {current.map((m) => (
                          <li key={m.id} className="rounded-md border border-slate-200 px-2 py-1 text-sm">
                            {m.person?.full_name} <span className="text-xs text-slate-500">· {TEAM_ROLE_LABEL[m.role]}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardBody>
                </Card>
              );
            })
          )}
        </div>
        {canManage ? (
          <Card>
            <CardHeader title="Nova equipe" />
            <CardBody>
              <ActionForm action={saveTeam} schema="team" resetOnSuccess submitLabel="Criar equipe">
                <input type="hidden" name="program_id" value={program.id} />
                <TextField name="name" label="Nome da equipe" required />
                <SelectField name="occupation_id" label="Ocupação (opcional)" defaultValue="">
                  <option value="">Sem ocupação</option>
                  {(occupations ?? []).map((o) => <option key={o.id} value={o.id}>{o.code} — {o.name}</option>)}
                </SelectField>
                <TextareaField name="notes" label="Observações" hint="Ex.: composição A/B a confirmar (PRD §6)." />
              </ActionForm>
            </CardBody>
          </Card>
        ) : null}
      </div>
    </>
  );
}
