import Link from "next/link";
import type { Metadata } from "next";
import { LayoutGrid, List, Search } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { requireAccess, hasRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { listPrograms } from "@/features/programas/queries";
import { listPeopleOptions } from "@/features/equipes/queries";
import { dueLabel } from "@/features/acoes/domain";
import { STAGE_LABEL, THEME_LABEL, type Stage, type Theme } from "@/features/bi/domain";
import { ActionBoard, type BoardCard } from "@/features/acoes/components/board";
import { NewActionButton } from "@/features/acoes/components/new-action";
import { importBacklog } from "@/features/acoes/actions";
import { BACKLOG_REUNIAO_2026_11_24 } from "@/features/acoes/backlog-reuniao";
import { ActionForm } from "@/components/ui/action-form";
import { SelectField } from "@/components/ui/field-errors";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Ações" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function AcoesPage({ searchParams }: PageProps<"/acoes">) {
  const sp = await searchParams;
  const access = await requireAccess();
  const supabase = await createClient();
  const programs = (await listPrograms(supabase)).filter((p) => (access.roles[p.id] ?? []).some((r) => ["supervisao", "gestao", "orientador", "competidor"].includes(r)));
  const header = <PageHeader title="Ações" description="Acompanhe o que está sendo feito em cada frente. Arraste os cartões ou use os botões para avançar." />;
  if (!programs.length) return <>{header}<EmptyState title="Nenhuma frente no seu escopo">Peça à administração um vínculo com um programa.</EmptyState></>;

  const view = one(sp.visao) === "lista" ? "lista" : "quadro";
  const f = { frente: one(sp.frente), responsavel: one(sp.responsavel), tema: one(sp.tema), q: one(sp.q).trim().slice(0, 80), minhas: one(sp.minhas) === "1", atrasadas: one(sp.atrasadas) === "1" };
  const programIds = programs.map((p) => p.id);
  const label = (p: (typeof programs)[number]) => `${p.competition?.name ?? ""} · ${(p.unit?.name ?? "").replace(/^SENAI Vitória — /, "")}`;
  const programLabel = new Map(programs.map((p) => [p.id, label(p)]));

  const [people, { data: teams }, { data: me }] = await Promise.all([
    listPeopleOptions(supabase),
    supabase.from("teams").select("id, name, program_id").in("program_id", programIds).is("archived_at", null).order("name"),
    supabase.from("people").select("id").eq("user_id", access.userId).maybeSingle(),
  ]);

  let q = supabase
    .from("actions_view")
    .select("id, title, stage, status, priority, due_date, is_overdue, blocked, blocked_reason, theme, program_id, team_id, owner_person_id, completed_at")
    .in("program_id", f.frente && programIds.includes(f.frente) ? [f.frente] : programIds)
    .is("archived_at", null)
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(500);
  if (view === "quadro") q = q.neq("status", "cancelada");
  if (f.responsavel === "sem") q = q.is("owner_person_id", null);
  else if (f.responsavel) q = q.eq("owner_person_id", f.responsavel);
  if (f.minhas && me?.id) q = q.eq("owner_person_id", me.id);
  if (f.tema && f.tema in THEME_LABEL) q = q.eq("theme", f.tema as Theme);
  if (f.atrasadas) q = q.eq("is_overdue", true);
  if (f.q) q = q.ilike("title", `%${f.q.replace(/[%_]/g, "")}%`);
  const { data: rows } = await q;

  const teamName = new Map((teams ?? []).map((t) => [t.id, t.name]));
  const personName = new Map(people.map((p) => [p.id, p.full_name]));
  const cards: BoardCard[] = (rows ?? []).map((a) => {
    const isSup = hasRole(access, a.program_id, "supervisao");
    return {
      id: a.id!,
      title: a.title!,
      stage: a.stage as Stage,
      programId: a.program_id!,
      programLabel: programLabel.get(a.program_id!) ?? "",
      teamName: a.team_id ? teamName.get(a.team_id) ?? null : null,
      ownerName: a.owner_person_id ? personName.get(a.owner_person_id) ?? null : null,
      dueLabel: a.due_date ? (a.stage === "concluida" ? `Prazo ${formatDate(a.due_date)}` : dueLabel({ due_date: a.due_date, status: a.status! })) : null,
      overdue: Boolean(a.is_overdue),
      blocked: Boolean(a.blocked),
      blockedReason: a.blocked_reason,
      theme: a.theme as Theme | null,
      isSupervisor: isSup,
      canMove: isSup || (hasRole(access, a.program_id, "orientador") && Boolean(a.team_id)),
    };
  });

  const qs = (over: Record<string, string>) => {
    const s = new URLSearchParams();
    const base: Record<string, string> = { visao: view, frente: f.frente, responsavel: f.responsavel, tema: f.tema, q: f.q, minhas: f.minhas ? "1" : "", atrasadas: f.atrasadas ? "1" : "" };
    for (const [k, v] of Object.entries({ ...base, ...over })) if (v) s.set(k, v);
    return `/acoes?${s}`;
  };
  const creatable = programs.filter((p) => hasRole(access, p.id, "supervisao", "orientador"));
  const supervised = programs.filter((p) => hasRole(access, p.id, "supervisao"));
  const chip = (active: boolean) => cn("inline-flex h-9 items-center rounded-full border px-3 text-sm transition", active ? "border-brand-600 bg-brand-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300");

  return (
    <>
      <PageHeader
        title="Ações"
        description="Acompanhe o que está sendo feito em cada frente. Arraste os cartões ou use os botões para avançar."
        actions={
          <NewActionButton
            programs={creatable.map((p) => ({ id: p.id, label: label(p), canGeneral: hasRole(access, p.id, "supervisao") }))}
            teams={(teams ?? []).map((t) => ({ id: t.id, label: t.name, programId: t.program_id }))}
            people={people.map((p) => ({ id: p.id, label: p.full_name }))}
            defaultProgramId={f.frente || undefined}
          />
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <form method="get" className="flex flex-1 flex-wrap items-center gap-2" role="search">
          <input type="hidden" name="visao" value={view} />
          <label className="relative min-w-56 flex-1">
            <span className="sr-only">Buscar ação</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input name="q" defaultValue={f.q} placeholder="Buscar ação…" className="h-9 w-full rounded-full border border-slate-200 bg-white pl-9 pr-3 text-sm shadow-sm" />
          </label>
          <select name="frente" defaultValue={f.frente} aria-label="Frente" className="h-9 rounded-full border border-slate-200 bg-white px-3 text-sm shadow-sm">
            <option value="">Todas as frentes</option>
            {programs.map((p) => <option key={p.id} value={p.id}>{label(p)}</option>)}
          </select>
          <select name="responsavel" defaultValue={f.responsavel} aria-label="Responsável" className="h-9 rounded-full border border-slate-200 bg-white px-3 text-sm shadow-sm">
            <option value="">Todos os responsáveis</option>
            <option value="sem">Sem responsável</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
          <select name="tema" defaultValue={f.tema} aria-label="Tema" className="h-9 rounded-full border border-slate-200 bg-white px-3 text-sm shadow-sm">
            <option value="">Todos os temas</option>
            {Object.entries(THEME_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          {f.minhas ? <input type="hidden" name="minhas" value="1" /> : null}
          {f.atrasadas ? <input type="hidden" name="atrasadas" value="1" /> : null}
          <button className="h-9 rounded-full bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-800">Filtrar</button>
        </form>
        <div className="flex flex-wrap items-center gap-2">
          {me?.id ? <Link href={qs({ minhas: f.minhas ? "" : "1" })} className={chip(f.minhas)}>Minhas</Link> : null}
          <Link href={qs({ atrasadas: f.atrasadas ? "" : "1" })} className={chip(f.atrasadas)}>Atrasadas</Link>
          <nav aria-label="Visualização" className="flex rounded-full border border-slate-200 bg-white p-0.5 shadow-sm">
            {([["quadro", "Quadro", LayoutGrid], ["lista", "Lista", List]] as const).map(([k, l, Icon]) => (
              <Link key={k} href={qs({ visao: k })} aria-current={view === k ? "page" : undefined}
                className={cn("flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm", view === k ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100")}>
                <Icon className="size-4" aria-hidden /> {l}
              </Link>
            ))}
          </nav>
        </div>
      </div>

      {view === "quadro" ? (
        <ActionBoard cards={cards} />
      ) : cards.length === 0 ? (
        <EmptyState title="Nenhuma ação encontrada" />
      ) : (
        <Table caption="Ações">
          <thead><tr><Th>Ação</Th><Th>Frente</Th><Th>Responsável</Th><Th>Prazo</Th><Th>Etapa</Th></tr></thead>
          <tbody>{cards.map((c) => (
            <Tr key={c.id}>
              <Td><Link href={`/acoes/${c.id}`} className="font-medium text-brand-700 hover:underline">{c.title}</Link>{c.blocked ? <Badge tone="warning" className="ml-2">Bloqueada</Badge> : null}{c.theme ? <span className="ml-2 text-xs text-slate-500">{THEME_LABEL[c.theme]}</span> : null}</Td>
              <Td className="text-xs">{c.programLabel}{c.teamName ? ` · ${c.teamName}` : ""}</Td>
              <Td className="text-xs">{c.ownerName ?? <span className="text-slate-400">Sem responsável</span>}</Td>
              <Td className={cn("text-xs", c.overdue && "font-semibold text-red-700")}>{c.dueLabel ?? "—"}</Td>
              <Td><Badge tone={c.stage === "concluida" ? "success" : c.stage === "em_validacao" ? "accent" : c.stage === "em_andamento" ? "brand" : "neutral"}>{STAGE_LABEL[c.stage]}</Badge></Td>
            </Tr>
          ))}</tbody>
        </Table>
      )}

      {supervised.length ? (
        <details className="mt-8 rounded-2xl border border-slate-200/80 bg-white p-4 text-sm">
          <summary className="cursor-pointer font-medium text-slate-700">Importar backlog da reunião de 24/11/2026</summary>
          <ActionForm action={importBacklog} schema="backlogImport" submitLabel="Importar" submitVariant="secondary" className="mt-3 grid gap-3 sm:grid-cols-3">
            <SelectField name="program_id" label="Frente" defaultValue={supervised[0].id}>
              {supervised.map((p) => <option key={p.id} value={p.id}>{label(p)}</option>)}
            </SelectField>
            <SelectField name="group" label="Grupo" defaultValue="geral">
              {Object.entries(BACKLOG_REUNIAO_2026_11_24).map(([k, g]) => <option key={k} value={k}>{g.label} ({g.items.length})</option>)}
            </SelectField>
          </ActionForm>
          <p className="mt-2 text-xs text-slate-500">Itens entram em “A fazer”, sem responsável e sem prazo inventado. Repetir não duplica.</p>
        </details>
      ) : null}
    </>
  );
}
