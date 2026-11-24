import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { ActionForm } from "@/components/ui/action-form";
import { SelectField, TextField } from "@/components/ui/field-errors";
import { ArchiveButton } from "@/components/ui/archive-button";
import { requireAccess, supervisedPrograms } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { savePerson } from "@/features/equipes/actions";
import { linkPersonToUser } from "@/features/admin/actions";
import { setArchived } from "@/features/programas/actions";
import { PERSON_KIND_LABEL } from "@/features/labels";
import { listPrograms } from "@/features/programas/queries";

export const metadata: Metadata = { title: "Pessoas" };

export default async function PessoasPage({ searchParams }: PageProps<"/equipes/pessoas">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const access = await requireAccess();
  const supabase = await createClient();
  const programs = await listPrograms(supabase);
  const supervised = new Set(supervisedPrograms(access));
  const units = new Map(programs.filter((p) => supervised.has(p.id) && p.unit).map((p) => [p.unit!.id, p.unit!.name]));

  let query = supabase.from("people").select("id, full_name, kind, email, unit_id, user_id, archived_at, unit:units(name)").order("full_name").limit(200);
  if (q) query = query.ilike("full_name", `%${q.replace(/[%_]/g, "")}%`);
  const { data: people } = await query;

  return (
    <>
      <PageHeader
        eyebrow="RF03"
        title="Cadastro de pessoas"
        description="Dados mínimos (LGPD): nome, vínculo institucional e contato opcional. Visível apenas a quem tem escopo sobre a pessoa."
      />
      <Alert tone="warning" className="mb-6">Não cadastre dados reais em ambientes de desenvolvimento ou demonstração (PRD §10).</Alert>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <form method="get" className="flex gap-2" role="search">
            <label htmlFor="busca" className="sr-only">Buscar por nome</label>
            <input id="busca" name="q" defaultValue={q} placeholder="Buscar por nome…" className="h-10 flex-1 rounded-md border border-slate-300 px-3 text-sm" />
            <button className="h-10 rounded-md bg-brand-700 px-4 text-sm font-medium text-white">Buscar</button>
          </form>
          {(people ?? []).length === 0 ? (
            <EmptyState title="Nenhuma pessoa visível">Você vê pessoas das unidades que supervisiona ou gere e das equipes às quais está vinculado(a).</EmptyState>
          ) : (
            <Table caption="Pessoas">
              <thead><tr><Th>Nome</Th><Th>Vínculo</Th><Th>Unidade</Th><Th>Login</Th><Th><span className="sr-only">Ações</span></Th></tr></thead>
              <tbody>
                {(people ?? []).map((p) => (
                  <Tr key={p.id}>
                    <Td className="font-medium">
                      {p.full_name} {p.archived_at ? <span className="text-xs text-slate-500">(arquivada)</span> : null}
                      {units.has(p.unit_id) ? (
                        <details className="mt-1 font-normal">
                          <summary className="cursor-pointer text-xs text-brand-700">Editar</summary>
                          <div className="mt-2 max-w-md space-y-4">
                            <PersonForm units={units} p={p} />
                            <ActionForm action={linkPersonToUser} submitLabel="Atualizar login" submitVariant="secondary">
                              <input type="hidden" name="person_id" value={p.id} />
                              <TextField id={`link-${p.id}`} name="email" type="email" label="E-mail do login (vazio remove)" hint="O usuário precisa ter convite e vínculo vigente nesta unidade." />
                            </ActionForm>
                          </div>
                        </details>
                      ) : null}
                    </Td>
                    <Td>{PERSON_KIND_LABEL[p.kind]}</Td>
                    <Td>{p.unit?.name}</Td>
                    <Td>{p.user_id ? "Sim" : "Não"}</Td>
                    <Td>{units.has(p.unit_id) ? <ArchiveButton archived={Boolean(p.archived_at)} onToggle={setArchived.bind(null, "people", p.id, !p.archived_at, "/equipes/pessoas")} /> : null}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
        {units.size > 0 ? (
          <Card>
            <CardHeader title="Nova pessoa" description="Vínculo de login com usuário é feito pela administração." />
            <CardBody><PersonForm units={units} /></CardBody>
          </Card>
        ) : null}
      </div>
    </>
  );
}

function PersonForm({ units, p }: { units: Map<string, string>; p?: { id: string; full_name: string; kind: keyof typeof PERSON_KIND_LABEL; email: string | null; unit_id: string } }) {
  const k = p?.id ?? "novo";
  return (
    <ActionForm action={savePerson} schema="person" resetOnSuccess={!p}>
      {p ? <input type="hidden" name="id" value={p.id} /> : null}
      <TextField id={`pe-name-${k}`} name="full_name" label="Nome completo" defaultValue={p?.full_name} required />
      <SelectField id={`pe-kind-${k}`} name="kind" label="Vínculo institucional" defaultValue={p?.kind ?? "aluno"}>
        {Object.entries(PERSON_KIND_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </SelectField>
      <SelectField id={`pe-unit-${k}`} name="unit_id" label="Unidade" defaultValue={p?.unit_id ?? [...units.keys()][0]}>
        {[...units].map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </SelectField>
      <TextField id={`pe-email-${k}`} name="email" type="email" label="E-mail (opcional)" defaultValue={p?.email ?? ""} hint="Somente contato autorizado." />
    </ActionForm>
  );
}
