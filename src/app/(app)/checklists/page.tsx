import Link from "next/link";
import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { ActionForm } from "@/components/ui/action-form";
import { SelectField, TextField, TextareaField } from "@/components/ui/field-errors";
import { ProgramPicker } from "@/components/layout/program-picker";
import { hasRole, requireAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, todayLocal } from "@/lib/dates";
import { listPrograms, pickProgram, programLabel } from "@/features/programas/queries";
import { createRun, createTemplate } from "@/features/checklists/actions";
import { CADENCE_LABEL, TEMPLATE_STATUS_LABEL, periodFor } from "@/features/checklists/domain";

export const metadata: Metadata = { title: "Checklists" };

export default async function ChecklistsPage({ searchParams }: PageProps<"/checklists">) {
  const sp = await searchParams;
  const access = await requireAccess();
  const supabase = await createClient();
  const programs = await listPrograms(supabase);
  const program = pickProgram(programs, sp.programa) ?? programs[0] ?? null;
  const header = <PageHeader eyebrow="Etapa 1 · cadência" title="Checklists" description="Modelos versionados com itens obrigatórios e exigência de evidência, aplicados por período (semanal, mensal ou avulso) e por equipe ou programa." />;
  if (!program) return <>{header}<EmptyState title="Nenhum programa no seu escopo" /></>;

  const [{ data: templates }, { data: runs }, { data: teams }] = await Promise.all([
    supabase.from("checklist_templates").select("id, name, cadence, scope, status, version, family_id, archived_at").eq("program_id", program.id).order("name").order("version", { ascending: false }),
    supabase.from("checklist_runs").select("id, period_start, period_end, status, completed_at, team:teams(name), template:checklist_templates(name, version)").eq("program_id", program.id).order("period_start", { ascending: false }).limit(100),
    supabase.from("teams").select("id, name").eq("program_id", program.id).is("archived_at", null).order("name"),
  ]);
  const isSup = hasRole(access, program.id, "supervisao");
  const canApply = isSup || hasRole(access, program.id, "orientador");
  const published = (templates ?? []).filter((t) => t.status === "publicado" && !t.archived_at);
  const today = todayLocal();

  return (
    <>
      {header}
      <div className="mb-6"><ProgramPicker programs={programs.map((p) => ({ id: p.id, label: programLabel(p) }))} value={program.id} /></div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Aplicações" description="Mais recentes primeiro. Pendente = período encerrado sem conclusão." />
            <CardBody>
              {(runs ?? []).length === 0 ? <EmptyState title="Nenhuma aplicação registrada" /> : (
                <Table caption="Aplicações de checklist">
                  <thead><tr><Th>Checklist</Th><Th>Equipe</Th><Th>Período</Th><Th>Situação</Th></tr></thead>
                  <tbody>
                    {(runs ?? []).map((r) => (
                      <Tr key={r.id}>
                        <Td><Link href={`/checklists/${r.id}`} className="font-medium text-brand-700 hover:underline">{r.template?.name}</Link> <span className="text-xs text-slate-500">v{r.template?.version}</span></Td>
                        <Td className="text-xs">{r.team?.name ?? "Programa"}</Td>
                        <Td className="whitespace-nowrap text-xs">{formatDate(r.period_start)} – {formatDate(r.period_end)}</Td>
                        <Td>
                          {r.status === "concluido" ? <Badge tone="success">Concluído</Badge> : r.period_end < today ? <Badge tone="danger">Pendente</Badge> : <Badge tone="info">Em aberto</Badge>}
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Modelos" description="Modelos publicados são imutáveis; editar cria nova versão." />
            <CardBody>
              {(templates ?? []).length === 0 ? <EmptyState title="Nenhum modelo cadastrado" /> : (
                <ul className="divide-y divide-slate-100">
                  {(templates ?? []).map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <Link href={`/checklists/modelos/${t.id}`} className="font-medium text-brand-700 hover:underline">{t.name} <span className="text-xs text-slate-500">v{t.version}</span></Link>
                      <span className="flex gap-1">
                        <Badge>{CADENCE_LABEL[t.cadence]}</Badge>
                        <Badge>{t.scope === "equipe" ? "Por equipe" : "Programa"}</Badge>
                        <Badge tone={t.status === "publicado" ? "success" : t.status === "rascunho" ? "warning" : "neutral"}>{TEMPLATE_STATUS_LABEL[t.status]}</Badge>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
        <div className="space-y-6">
          {canApply && published.length ? (
            <Card>
              <CardHeader title="Aplicar checklist" description="O período sugerido segue a cadência do modelo." />
              <CardBody>
                <ActionForm action={createRun} schema="checklistRun" submitLabel="Abrir aplicação">
                  <input type="hidden" name="program_id" value={program.id} />
                  <SelectField name="template_id" label="Modelo" required defaultValue="">
                    <option value="" disabled>Selecione…</option>
                    {published.map((t) => <option key={t.id} value={t.id}>{t.name} ({CADENCE_LABEL[t.cadence]}, {t.scope === "equipe" ? "por equipe" : "programa"})</option>)}
                  </SelectField>
                  <SelectField name="team_id" label="Equipe" defaultValue="" hint="Deixe em branco para modelos do programa.">
                    <option value="">Programa (sem equipe)</option>
                    {(teams ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </SelectField>
                  <div className="grid grid-cols-2 gap-3">
                    <TextField name="period_start" type="date" label="Início" defaultValue={periodFor("semanal", today).start} required />
                    <TextField name="period_end" type="date" label="Fim" defaultValue={periodFor("semanal", today).end} required />
                  </div>
                </ActionForm>
              </CardBody>
            </Card>
          ) : null}
          {isSup ? (
            <Card>
              <CardHeader title="Novo modelo" />
              <CardBody>
                <ActionForm action={createTemplate} schema="checklistTemplate" submitLabel="Criar rascunho">
                  <input type="hidden" name="program_id" value={program.id} />
                  <TextField name="name" label="Nome" required />
                  <div className="grid grid-cols-2 gap-3">
                    <SelectField name="cadence" label="Cadência" defaultValue="semanal">
                      {Object.entries(CADENCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </SelectField>
                    <SelectField name="scope" label="Escopo" defaultValue="equipe">
                      <option value="equipe">Por equipe</option>
                      <option value="programa">Programa</option>
                    </SelectField>
                  </div>
                  <TextareaField name="description" label="Descrição" />
                </ActionForm>
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
