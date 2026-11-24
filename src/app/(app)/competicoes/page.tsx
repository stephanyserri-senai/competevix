import Link from "next/link";
import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { ActionForm } from "@/components/ui/action-form";
import { SelectField, TextField, TextareaField } from "@/components/ui/field-errors";
import { ArchiveButton } from "@/components/ui/archive-button";
import { requireAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/dates";
import { listPrograms } from "@/features/programas/queries";
import { createProgram, saveCompetition, saveCycle, setArchived } from "@/features/programas/actions";
import { COMPETITION_KIND_LABEL, PROGRAM_STATUS_LABEL } from "@/features/labels";

export const metadata: Metadata = { title: "Competições" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function CompeticoesPage({ searchParams }: PageProps<"/competicoes">) {
  const sp = await searchParams;
  const access = await requireAccess();
  const supabase = await createClient();
  const showArchived = one(sp.arquivados) === "1";

  const [programs, { data: competitions }, { data: cycles }, { data: units }, { data: unitMemberships }] = await Promise.all([
    listPrograms(supabase, { includeArchived: showArchived }),
    supabase.from("competitions").select("*").order("name"),
    supabase.from("cycles").select("*").order("code", { ascending: false }),
    supabase.from("units").select("id, code, name, archived_at").order("name"),
    supabase.from("memberships").select("unit_id").eq("user_id", access.userId).eq("role", "supervisao").not("unit_id", "is", null).is("revoked_at", null),
  ]);

  const fComp = one(sp.competicao);
  const fCycle = one(sp.ciclo);
  const fUnit = one(sp.unidade);
  const filtered = programs.filter(
    (p) => (!fComp || p.competition_id === fComp) && (!fCycle || p.cycle_id === fCycle) && (!fUnit || p.unit_id === fUnit),
  );
  const creatableUnits = access.isAdmin
    ? (units ?? []).filter((u) => !u.archived_at)
    : (units ?? []).filter((u) => unitMemberships?.some((m) => m.unit_id === u.id));

  return (
    <>
      <PageHeader
        eyebrow="RF02"
        title="Competições, ciclos e programas"
        description="Programa = competição × ciclo × unidade. É o escopo de acesso: equipes, agenda, ações e documentos pertencem a um programa. Registros são arquivados, nunca apagados."
      />

      <Card className="mb-6">
        <CardHeader title="Programas" description={`${filtered.length} programa(s) no seu escopo`} />
        <CardBody className="space-y-4">
          <form method="get" className="flex flex-wrap items-end gap-3" aria-label="Filtros de programas">
            <SelectFilter name="competicao" label="Competição" value={fComp} options={(competitions ?? []).map((c) => [c.id, c.name])} />
            <SelectFilter name="ciclo" label="Ciclo" value={fCycle} options={(cycles ?? []).map((c) => [c.id, c.name])} />
            <SelectFilter name="unidade" label="Unidade" value={fUnit} options={(units ?? []).map((u) => [u.id, u.name])} />
            <label className="flex items-center gap-2 pb-2 text-sm">
              <input type="checkbox" name="arquivados" value="1" defaultChecked={showArchived} className="size-4" /> Incluir arquivados
            </label>
            <button type="submit" className="h-10 rounded-md bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-800">Filtrar</button>
            <Link href="/competicoes" className="pb-2 text-sm text-brand-700 hover:underline">Limpar</Link>
          </form>

          {filtered.length === 0 ? (
            <EmptyState title="Nenhum programa encontrado">
              Não há programas no seu escopo com esses filtros. Programas são criados pela administração ou pela supervisão da unidade.
            </EmptyState>
          ) : (
            <Table caption="Programas">
              <thead>
                <tr><Th>Competição</Th><Th>Ciclo</Th><Th>Unidade</Th><Th>Status</Th><Th>Meu papel</Th><Th><span className="sr-only">Ações</span></Th></tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <Tr key={p.id}>
                    <Td className="font-medium">
                      <Link href={`/competicoes/${p.id}`} className="text-brand-700 hover:underline">{p.competition?.name}</Link>
                    </Td>
                    <Td>{p.cycle?.name}</Td>
                    <Td>{p.unit?.name}</Td>
                    <Td>
                      <Badge tone={p.status === "ativo" ? "success" : p.status === "encerrado" ? "neutral" : "info"}>{PROGRAM_STATUS_LABEL[p.status]}</Badge>
                      {p.archived_at ? <Badge className="ml-1">Arquivado</Badge> : null}
                    </Td>
                    <Td className="text-xs text-slate-600">{(access.roles[p.id] ?? []).join(", ") || (access.isAdmin ? "administração" : "—")}</Td>
                    <Td className="text-right">
                      {access.isAdmin ? (
                        <ArchiveButton archived={Boolean(p.archived_at)} onToggle={setArchived.bind(null, "programs", p.id, !p.archived_at, "/competicoes")} />
                      ) : null}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      {creatableUnits.length > 0 ? (
        <Card className="mb-6">
          <CardHeader title="Novo programa" description="Disponível para administração e supervisão com vínculo na unidade. O escopo não pode ser alterado depois." />
          <CardBody>
            <ActionForm action={createProgram} schema="program" submitLabel="Criar programa" resetOnSuccess className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 [&>button]:self-end">
              <SelectField name="competition_id" label="Competição" required defaultValue="">
                <option value="" disabled>Selecione…</option>
                {(competitions ?? []).filter((c) => !c.archived_at).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </SelectField>
              <SelectField name="cycle_id" label="Ciclo" required defaultValue="">
                <option value="" disabled>Selecione…</option>
                {(cycles ?? []).filter((c) => !c.archived_at).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </SelectField>
              <SelectField name="unit_id" label="Unidade" required defaultValue="">
                <option value="" disabled>Selecione…</option>
                {creatableUnits.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </SelectField>
              <SelectField name="status" label="Status" defaultValue="planejamento">
                {Object.entries(PROGRAM_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </SelectField>
            </ActionForm>
          </CardBody>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Competições" description="Catálogo institucional. FRC, Giaffone e E-Kart usam módulos comuns até o levantamento específico (etapa 5)." />
          <CardBody className="space-y-3">
            <ul className="divide-y divide-slate-100">
              {(competitions ?? []).map((c) => (
                <li key={c.id} className="py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium text-slate-900">{c.name} <span className="text-xs text-slate-500">({c.code})</span></p>
                      <p className="text-xs text-slate-600">{COMPETITION_KIND_LABEL[c.kind]}{c.archived_at ? " · arquivada" : ""}</p>
                    </div>
                    {access.isAdmin ? (
                      <ArchiveButton archived={Boolean(c.archived_at)} onToggle={setArchived.bind(null, "competitions", c.id, !c.archived_at, "/competicoes")} />
                    ) : null}
                  </div>
                  {access.isAdmin ? (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-sm text-brand-700">Editar</summary>
                      <div className="mt-3"><CompetitionForm c={c} /></div>
                    </details>
                  ) : null}
                </li>
              ))}
            </ul>
            {access.isAdmin ? (
              <details>
                <summary className="cursor-pointer text-sm font-medium text-brand-700">+ Nova competição</summary>
                <div className="mt-3"><CompetitionForm /></div>
              </details>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Ciclos" description="Datas oficiais são opcionais até a confirmação do calendário (PRD §14)." />
          <CardBody className="space-y-3">
            <ul className="divide-y divide-slate-100">
              {(cycles ?? []).map((c) => (
                <li key={c.id} className="py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium text-slate-900">{c.name} <span className="text-xs text-slate-500">({c.code})</span></p>
                      <p className="text-xs text-slate-600">
                        {c.start_date || c.end_date ? `${formatDate(c.start_date)} a ${formatDate(c.end_date)}` : "Datas a definir"}
                        {c.archived_at ? " · arquivado" : ""}
                      </p>
                    </div>
                    {access.isAdmin ? (
                      <ArchiveButton archived={Boolean(c.archived_at)} onToggle={setArchived.bind(null, "cycles", c.id, !c.archived_at, "/competicoes")} />
                    ) : null}
                  </div>
                  {access.isAdmin ? (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-sm text-brand-700">Editar</summary>
                      <div className="mt-3"><CycleForm c={c} /></div>
                    </details>
                  ) : null}
                </li>
              ))}
            </ul>
            {access.isAdmin ? (
              <details>
                <summary className="cursor-pointer text-sm font-medium text-brand-700">+ Novo ciclo</summary>
                <div className="mt-3"><CycleForm /></div>
              </details>
            ) : null}
          </CardBody>
        </Card>
      </div>
    </>
  );
}

function SelectFilter({ name, label, value, options }: { name: string; label: string; value: string; options: [string, string][] }) {
  return (
    <label className="text-sm">
      <span className="mb-1 block font-medium text-slate-800">{label}</span>
      <select name={name} defaultValue={value} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm">
        <option value="">Todas</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

function CompetitionForm({ c }: { c?: { id: string; code: string; name: string; kind: keyof typeof COMPETITION_KIND_LABEL; description: string | null } }) {
  return (
    <ActionForm action={saveCompetition} schema="competition" resetOnSuccess={!c}>
      {c ? <input type="hidden" name="id" value={c.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField name="code" label="Código" defaultValue={c?.code} required id={`comp-code-${c?.id ?? "novo"}`} />
        <TextField name="name" label="Nome" defaultValue={c?.name} required id={`comp-name-${c?.id ?? "novo"}`} />
      </div>
      <SelectField name="kind" label="Tipo" defaultValue={c?.kind ?? "outra"} id={`comp-kind-${c?.id ?? "novo"}`}>
        {Object.entries(COMPETITION_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </SelectField>
      <TextareaField name="description" label="Descrição" defaultValue={c?.description ?? ""} id={`comp-desc-${c?.id ?? "novo"}`} />
    </ActionForm>
  );
}

function CycleForm({ c }: { c?: { id: string; code: string; name: string; start_date: string | null; end_date: string | null } }) {
  return (
    <ActionForm action={saveCycle} schema="cycle" resetOnSuccess={!c}>
      {c ? <input type="hidden" name="id" value={c.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField name="code" label="Código" defaultValue={c?.code} required id={`cy-code-${c?.id ?? "novo"}`} />
        <TextField name="name" label="Nome" defaultValue={c?.name} required id={`cy-name-${c?.id ?? "novo"}`} />
        <TextField name="start_date" type="date" label="Início" defaultValue={c?.start_date ?? ""} id={`cy-start-${c?.id ?? "novo"}`} />
        <TextField name="end_date" type="date" label="Término" defaultValue={c?.end_date ?? ""} id={`cy-end-${c?.id ?? "novo"}`} />
      </div>
    </ActionForm>
  );
}
