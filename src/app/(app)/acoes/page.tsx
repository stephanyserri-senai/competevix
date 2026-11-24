import Link from "next/link";
import type { Metadata } from "next";
import { LayoutGrid, List } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { ActionForm } from "@/components/ui/action-form";
import { SelectField, TextField, TextareaField } from "@/components/ui/field-errors";
import { Checkbox } from "@/components/ui/field";
import { ProgramPicker } from "@/components/layout/program-picker";
import { hasRole, requireAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayLocal } from "@/lib/dates";
import { listPrograms, pickProgram, programLabel } from "@/features/programas/queries";
import { listPeopleOptions } from "@/features/equipes/queries";
import { importBacklog, saveAction } from "@/features/acoes/actions";
import { PRIORITY_LABEL, STATUS_LABEL, STATUS_ORDER, type ActionStatus } from "@/features/acoes/domain";
import { DueInfo, PriorityBadge, StatusBadge } from "@/features/acoes/components/badges";
import { BACKLOG_REUNIAO_2026_11_24 } from "@/features/acoes/backlog-reuniao";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Ações" };
const PAGE_SIZE = 50;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function AcoesPage({ searchParams }: PageProps<"/acoes">) {
  const sp = await searchParams;
  const access = await requireAccess();
  const supabase = await createClient();
  const programs = await listPrograms(supabase);
  const program = pickProgram(programs, sp.programa) ?? programs[0] ?? null;
  const header = (
    <PageHeader eyebrow="RF05" title="Ações" description="Plano de ação com responsável, prazo, prioridade, dependências, evidências e histórico. Atraso é calculado pelo prazo e status." />
  );
  if (!program) return <>{header}<EmptyState title="Nenhum programa no seu escopo" /></>;

  const view = one(sp.visao) === "kanban" ? "kanban" : "tabela";
  const f = {
    status: one(sp.status),
    prioridade: one(sp.prioridade),
    equipe: one(sp.equipe),
    responsavel: one(sp.responsavel),
    atrasadas: one(sp.atrasadas) === "1",
    q: one(sp.q).trim().slice(0, 80),
    arquivadas: one(sp.arquivadas) === "1",
  };
  const page = Math.max(1, Number(one(sp.pagina)) || 1);

  let q = supabase
    .from("actions_view")
    .select("id, title, status, priority, due_date, team_id, owner_person_id, evidence_count, open_dependencies, is_overdue, origin, archived_at", { count: "exact" })
    .eq("program_id", program.id);
  if (!f.arquivadas) q = q.is("archived_at", null);
  if (f.status && STATUS_ORDER.includes(f.status as ActionStatus)) q = q.eq("status", f.status as ActionStatus);
  if (f.prioridade && f.prioridade in PRIORITY_LABEL) q = q.eq("priority", f.prioridade as keyof typeof PRIORITY_LABEL);
  if (f.equipe === "geral") q = q.is("team_id", null);
  else if (f.equipe) q = q.eq("team_id", f.equipe);
  if (f.responsavel === "sem") q = q.is("owner_person_id", null);
  else if (f.responsavel) q = q.eq("owner_person_id", f.responsavel);
  if (f.atrasadas) q = q.eq("is_overdue", true);
  if (f.q) q = q.ilike("title", `%${f.q.replace(/[%_]/g, "")}%`);
  q = q.order("due_date", { ascending: true, nullsFirst: false }).order("created_at", { ascending: true });
  q = view === "kanban" ? q.limit(300) : q.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const [{ data: rows, count }, { data: teams }, people] = await Promise.all([
    q,
    supabase.from("teams").select("id, name").eq("program_id", program.id).is("archived_at", null).order("name"),
    listPeopleOptions(supabase),
  ]);
  const teamName = new Map((teams ?? []).map((t) => [t.id, t.name]));
  const personName = new Map(people.map((p) => [p.id, p.full_name]));
  const isSup = hasRole(access, program.id, "supervisao");
  const canCreate = isSup || hasRole(access, program.id, "orientador");
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const qs = (over: Record<string, string>) => {
    const s = new URLSearchParams();
    const merged = { programa: program.id, visao: view, ...Object.fromEntries(Object.entries(f).map(([k, v]) => [k, typeof v === "boolean" ? (v ? "1" : "") : v])), ...over };
    for (const [k, v] of Object.entries(merged)) if (v) s.set(k, v);
    return `/acoes?${s.toString()}`;
  };

  return (
    <>
      {header}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <ProgramPicker programs={programs.map((p) => ({ id: p.id, label: programLabel(p) }))} value={program.id} />
        <nav aria-label="Visualização" className="flex rounded-md border border-slate-300 bg-white p-0.5">
          {[
            ["tabela", "Tabela", List],
            ["kanban", "Kanban", LayoutGrid],
          ].map(([key, label, Icon]) => (
            <Link
              key={key as string}
              href={qs({ visao: key as string, pagina: "" })}
              aria-current={view === key ? "page" : undefined}
              className={cn("flex items-center gap-1.5 rounded px-3 py-1.5 text-sm", view === key ? "bg-brand-700 text-white" : "text-slate-700 hover:bg-slate-100")}
            >
              <Icon className="size-4" aria-hidden /> {label as string}
            </Link>
          ))}
        </nav>
      </div>

      <form method="get" className="mb-6 grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-3 lg:grid-cols-7" aria-label="Filtros de ações">
        <input type="hidden" name="programa" value={program.id} />
        <input type="hidden" name="visao" value={view} />
        <label className="text-sm lg:col-span-2"><span className="mb-1 block font-medium">Buscar</span>
          <input name="q" defaultValue={f.q} placeholder="Título…" className="h-10 w-full rounded-md border border-slate-300 px-3" /></label>
        <FilterSelect name="status" label="Status" value={f.status} options={STATUS_ORDER.map((s) => [s, STATUS_LABEL[s]])} />
        <FilterSelect name="prioridade" label="Prioridade" value={f.prioridade} options={Object.entries(PRIORITY_LABEL)} />
        <FilterSelect name="equipe" label="Equipe" value={f.equipe} options={[["geral", "Geral (sem equipe)"], ...(teams ?? []).map((t) => [t.id, t.name] as [string, string])]} />
        <FilterSelect name="responsavel" label="Responsável" value={f.responsavel} options={[["sem", "A definir"], ...people.map((p) => [p.id, p.full_name] as [string, string])]} />
        <div className="flex flex-col justify-end gap-1 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" name="atrasadas" value="1" defaultChecked={f.atrasadas} className="size-4" /> Só atrasadas</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="arquivadas" value="1" defaultChecked={f.arquivadas} className="size-4" /> Incluir arquivadas</label>
        </div>
        <div className="flex items-end gap-3 sm:col-span-3 lg:col-span-7">
          <button className="h-10 rounded-md bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-800">Aplicar filtros</button>
          <Link href={`/acoes?programa=${program.id}&visao=${view}`} className="text-sm text-brand-700 hover:underline">Limpar</Link>
          <span className="ml-auto text-sm text-slate-600">{total} ação(ões) · referência {todayLocal().split("-").reverse().join("/")}</span>
        </div>
      </form>

      {(rows ?? []).length === 0 ? (
        <EmptyState title="Nenhuma ação encontrada">Não há ações visíveis com esses filtros.</EmptyState>
      ) : view === "tabela" ? (
        <>
          <Table caption="Ações do programa">
            <thead><tr><Th>Ação</Th><Th>Equipe</Th><Th>Responsável</Th><Th>Prazo</Th><Th>Prioridade</Th><Th>Status</Th><Th>Evid.</Th></tr></thead>
            <tbody>
              {(rows ?? []).map((a) => (
                <Tr key={a.id!}>
                  <Td className="max-w-md">
                    <Link href={`/acoes/${a.id}`} className="font-medium text-brand-700 hover:underline">{a.title}</Link>
                    {a.open_dependencies ? <p className="text-xs text-amber-800">{a.open_dependencies} dependência(s) em aberto</p> : null}
                    {a.archived_at ? <Badge className="ml-1">Arquivada</Badge> : null}
                  </Td>
                  <Td className="text-xs">{a.team_id ? teamName.get(a.team_id) ?? "—" : "Geral"}</Td>
                  <Td className="text-xs">{a.owner_person_id ? personName.get(a.owner_person_id) ?? "—" : <span className="text-slate-500">A definir</span>}</Td>
                  <Td><DueInfo due_date={a.due_date} status={a.status!} /></Td>
                  <Td><PriorityBadge priority={a.priority!} /></Td>
                  <Td><StatusBadge status={a.status!} /></Td>
                  <Td className="text-center text-xs">{a.evidence_count}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          {pages > 1 ? (
            <nav aria-label="Paginação" className="mt-4 flex items-center justify-center gap-3 text-sm">
              {page > 1 ? <Link href={qs({ pagina: String(page - 1) })} className="text-brand-700 hover:underline">← Anterior</Link> : null}
              <span>Página {page} de {pages}</span>
              {page < pages ? <Link href={qs({ pagina: String(page + 1) })} className="text-brand-700 hover:underline">Próxima →</Link> : null}
            </nav>
          ) : null}
        </>
      ) : (
        <div className="grid gap-4 overflow-x-auto pb-2 md:grid-cols-5" role="list" aria-label="Quadro kanban">
          {STATUS_ORDER.map((s) => {
            const items = (rows ?? []).filter((a) => a.status === s);
            return (
              <section key={s} role="listitem" aria-label={`${STATUS_LABEL[s]}: ${items.length}`} className="min-w-56 rounded-lg bg-slate-100 p-3">
                <h2 className="mb-3 flex items-center justify-between text-sm font-semibold text-slate-800">
                  {STATUS_LABEL[s]} <span className="rounded-full bg-white px-2 text-xs">{items.length}</span>
                </h2>
                <ul className="space-y-2">
                  {items.map((a) => (
                    <li key={a.id!}>
                      <Link href={`/acoes/${a.id}`} className={cn("block rounded-md border bg-white p-3 shadow-sm hover:border-brand-400", a.is_overdue ? "border-red-300" : "border-slate-200")}>
                        <p className="text-sm font-medium text-slate-900">{a.title}</p>
                        <p className="mt-1 text-xs text-slate-600">{a.team_id ? teamName.get(a.team_id) : "Geral"} · {a.owner_person_id ? personName.get(a.owner_person_id) : "Responsável a definir"}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-1"><PriorityBadge priority={a.priority!} />{a.is_overdue ? <Badge tone="danger">Atrasada</Badge> : null}</div>
                        <div className="mt-1"><DueInfo due_date={a.due_date} status={a.status!} /></div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {canCreate ? (
        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title="Nova ação" description={isSup ? undefined : "Orientadores criam ações das equipes que orientam."} />
            <CardBody>
              <ActionForm action={saveAction} schema="action" submitLabel="Criar ação" className="grid gap-4 sm:grid-cols-2">
                <input type="hidden" name="program_id" value={program.id} />
                <TextField name="title" label="Título" required className="sm:col-span-2" />
                <SelectField name="team_id" label="Equipe" defaultValue="">
                  {isSup ? <option value="">Geral do programa</option> : <option value="" disabled>Selecione…</option>}
                  {(teams ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </SelectField>
                <SelectField name="owner_person_id" label="Responsável" defaultValue="">
                  <option value="">A definir</option>
                  {people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                </SelectField>
                <TextField name="start_date" type="date" label="Início" />
                <TextField name="due_date" type="date" label="Prazo" />
                <SelectField name="priority" label="Prioridade" defaultValue="media">
                  {Object.entries(PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </SelectField>
                <div className="flex items-end pb-2"><Checkbox id="req-ev" name="requires_evidence" label="Exigir evidência para concluir" /></div>
                <TextareaField name="description" label="Descrição" className="sm:col-span-2" />
              </ActionForm>
            </CardBody>
          </Card>
          {isSup ? (
            <Card>
              <CardHeader title="Backlog da reunião 24/11/2026" description="PRD §11. Importa como ações abertas, sem responsável e sem prazo (exceto a janela 30/11–04/12)." />
              <CardBody>
                <ActionForm action={importBacklog} schema="backlogImport" submitLabel="Importar para este programa" submitVariant="accent">
                  <input type="hidden" name="program_id" value={program.id} />
                  <SelectField name="group" label="Grupo" defaultValue={program.competition?.kind === "inova" ? "inova" : program.competition?.kind === "worldskills" ? "worldskills" : "geral"}>
                    {Object.entries(BACKLOG_REUNIAO_2026_11_24).map(([k, g]) => <option key={k} value={k}>{g.label} ({g.items.length} itens)</option>)}
                  </SelectField>
                  <p className="text-xs text-slate-600">Importação idempotente: itens já existentes neste programa não são duplicados.</p>
                </ActionForm>
              </CardBody>
            </Card>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function FilterSelect({ name, label, value, options }: { name: string; label: string; value: string; options: [string, string][] }) {
  return (
    <label className="text-sm"><span className="mb-1 block font-medium">{label}</span>
      <select name={name} defaultValue={value} className="h-10 w-full rounded-md border border-slate-300 bg-white px-2">
        <option value="">Todos</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}
