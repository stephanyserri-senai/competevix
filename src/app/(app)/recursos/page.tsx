import Link from "next/link";
import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { ActionForm } from "@/components/ui/action-form";
import { SelectField, TextField, TextareaField } from "@/components/ui/field-errors";
import { Checkbox } from "@/components/ui/field";
import { ProgramPicker } from "@/components/layout/program-picker";
import { hasRole, requireAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime, todayLocal } from "@/lib/dates";
import { listPrograms, pickProgram, programLabel } from "@/features/programas/queries";
import { addMovement, changeRequestStatus, createRequest, saveResource } from "@/features/gestao-actions";
import { CONDITION_LABEL, REQUEST_STATUS_LABEL, RESOURCE_TYPE_LABEL, nextRequestStatuses, type RequestStatus } from "@/features/recursos/domain";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Recursos" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const TABS = [["solicitacoes", "Solicitações"], ["inventario", "Inventário e ambientes"], ["movimentacoes", "Movimentações"]] as const;
const TONE: Record<RequestStatus, "neutral" | "info" | "brand" | "success" | "danger" | "warning"> = {
  rascunho: "warning", enviada: "info", em_analise: "brand", aprovada: "success", rejeitada: "danger", atendida: "success", cancelada: "neutral",
};

export default async function RecursosPage({ searchParams }: PageProps<"/recursos">) {
  const sp = await searchParams;
  const access = await requireAccess();
  const supabase = await createClient();
  const programs = await listPrograms(supabase);
  const program = pickProgram(programs, sp.programa) ?? programs[0] ?? null;
  const header = <PageHeader eyebrow="RF09" title="Recursos" description="Inventário e ambientes por unidade, solicitações com análise e decisão registradas, e movimentações. Aprovação no portal é registro interno: não substitui autorização institucional." />;
  if (!program) return <>{header}<EmptyState title="Nenhum programa no seu escopo" /></>;
  const tab = (TABS.find(([k]) => k === one(sp.aba))?.[0] ?? "solicitacoes") as (typeof TABS)[number][0];
  const isSup = hasRole(access, program.id, "supervisao");
  const canManage = isSup || hasRole(access, program.id, "orientador");
  const [{ data: resources }, { data: teams }] = await Promise.all([
    supabase.from("resources").select("*").eq("unit_id", program.unit_id).order("type").order("name"),
    supabase.from("teams").select("id, name").eq("program_id", program.id).is("archived_at", null).order("name"),
  ]);
  const link = (k: string) => `/recursos?programa=${program.id}&aba=${k}`;

  return (
    <>
      {header}
      <div className="mb-4"><ProgramPicker programs={programs.map((p) => ({ id: p.id, label: programLabel(p) }))} value={program.id} /></div>
      <nav aria-label="Seções" className="mb-6 flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map(([k, l]) => (
          <Link key={k} href={link(k)} aria-current={tab === k ? "page" : undefined}
            className={cn("-mb-px border-b-2 px-3 py-2 text-sm", tab === k ? "border-accent-500 font-semibold text-brand-900" : "border-transparent text-slate-600 hover:text-brand-800")}>{l}</Link>
        ))}
      </nav>
      {tab === "solicitacoes" ? <Solicitacoes /> : null}
      {tab === "inventario" ? <Inventario /> : null}
      {tab === "movimentacoes" ? <Movimentacoes /> : null}
    </>
  );

  async function Solicitacoes() {
    const { data: reqs } = await supabase
      .from("resource_requests")
      .select("*, team:teams(name), resource:resources(name), decider:profiles!resource_requests_decided_by_fkey(display_name), history:request_history(to_status, note, created_at)")
      .eq("program_id", program!.id)
      .order("created_at", { ascending: false });
    const today = todayLocal();
    return (
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {(reqs ?? []).length === 0 ? <EmptyState title="Nenhuma solicitação" /> : (reqs ?? []).map((r) => {
            const nexts = nextRequestStatuses(r.status, isSup);
            const late = r.needed_by && r.needed_by < today && !["atendida", "rejeitada", "cancelada"].includes(r.status);
            return (
              <Card key={r.id} as="article">
                <CardHeader
                  title={<>{r.title} {r.blocking ? <Badge tone="danger">Bloqueante</Badge> : null} {r.needs_analysis ? <Badge tone="warning">Necessidade a analisar</Badge> : null}</>}
                  description={`${r.team?.name ?? "Programa"} · ${Number(r.quantity).toLocaleString("pt-BR")} ${r.resource ? `· ${r.resource.name}` : ""}${r.needed_by ? ` · necessário até ${formatDate(r.needed_by)}` : ""}`}
                  actions={<Badge tone={TONE[r.status]}>{REQUEST_STATUS_LABEL[r.status]}</Badge>}
                />
                <CardBody className="space-y-2 text-sm">
                  <p className="whitespace-pre-line text-slate-700">{r.justification}</p>
                  {late ? <Alert tone="warning">Data de necessidade já passou.</Alert> : null}
                  {r.decided_at ? <p className="text-xs text-slate-600">Decisão: {REQUEST_STATUS_LABEL[r.status === "atendida" ? "aprovada" : r.status]} por {r.decider?.display_name ?? "—"} em {formatDateTime(r.decided_at)}{r.decision_note ? ` — ${r.decision_note}` : ""}</p> : null}
                  {r.history.length ? (
                    <details><summary className="cursor-pointer text-xs text-brand-700">Trâmite ({r.history.length})</summary>
                      <ul className="mt-1 space-y-0.5 text-xs text-slate-600">{[...r.history].sort((a, b) => (a.created_at < b.created_at ? -1 : 1)).map((h, i) => <li key={i}>{formatDateTime(h.created_at)} → {REQUEST_STATUS_LABEL[h.to_status]}{h.note ? `: ${h.note}` : ""}</li>)}</ul>
                    </details>
                  ) : null}
                  {canManage && nexts.length ? (
                    <ActionForm action={changeRequestStatus} schema="requestStatus" submitLabel="Registrar" submitVariant="secondary" className="flex flex-wrap items-end gap-3">
                      <input type="hidden" name="id" value={r.id} />
                      <SelectField id={`st-${r.id}`} name="status" label="Próximo passo" defaultValue={nexts[0]}>
                        {nexts.map((n) => <option key={n} value={n}>{REQUEST_STATUS_LABEL[n]}</option>)}
                      </SelectField>
                      <TextField id={`nt-${r.id}`} name="note" label="Observação / motivo" className="min-w-64 flex-1" hint="Obrigatório para rejeitar ou cancelar." />
                    </ActionForm>
                  ) : null}
                </CardBody>
              </Card>
            );
          })}
        </div>
        {canManage ? (
          <Card>
            <CardHeader title="Nova solicitação" description="Começa em rascunho; envie para análise da supervisão." />
            <CardBody>
              <ActionForm action={createRequest} schema="resourceRequest" resetOnSuccess submitLabel="Criar">
                <input type="hidden" name="program_id" value={program!.id} />
                <TextField name="title" label="Item / necessidade" required placeholder="Ex.: Movimentação da bancada Smart 4.0" />
                <SelectField name="team_id" label="Equipe" defaultValue="">
                  {isSup ? <option value="">Programa</option> : <option value="" disabled>Selecione…</option>}
                  {(teams ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </SelectField>
                <SelectField name="resource_id" label="Recurso do inventário (opcional)" defaultValue="">
                  <option value="">Não cadastrado / novo</option>
                  {(resources ?? []).filter((x) => !x.archived_at).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </SelectField>
                <div className="grid grid-cols-2 gap-3">
                  <TextField name="quantity" type="number" step="0.01" min={0} label="Quantidade" defaultValue={1} required />
                  <TextField name="needed_by" type="date" label="Necessário até" />
                </div>
                <TextareaField name="justification" label="Justificativa" required />
                <Checkbox id="rq-ana" name="needs_analysis" label="Necessidade a analisar (sem decisão de compra)" />
                <Checkbox id="rq-blk" name="blocking" label="Bloqueante para o treino/projeto (gera alerta)" />
              </ActionForm>
            </CardBody>
          </Card>
        ) : null}
      </div>
    );
  }

  async function Inventario() {
    return (
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {(resources ?? []).length === 0 ? <EmptyState title="Inventário vazio">Os itens são da unidade {program!.unit?.name} e compartilhados entre programas.</EmptyState> : (
            <Table caption="Inventário">
              <thead><tr><Th>Item</Th><Th>Tipo</Th><Th className="text-right">Qtd.</Th><Th>Condição</Th><Th>Local</Th></tr></thead>
              <tbody>{(resources ?? []).map((r) => (
                <Tr key={r.id}>
                  <Td className="font-medium">{r.name}{r.asset_code ? <span className="ml-1 text-xs text-slate-500">({r.asset_code})</span> : null}{r.bookable ? <Badge tone="brand" className="ml-1">Reservável</Badge> : null}{r.archived_at ? <Badge className="ml-1">Baixado</Badge> : null}
                    {r.availability_note ? <p className="text-xs font-normal text-slate-600">{r.availability_note}</p> : null}</Td>
                  <Td className="text-xs">{RESOURCE_TYPE_LABEL[r.type]}</Td>
                  <Td className="text-right">{Number(r.quantity).toLocaleString("pt-BR")} {r.measure_unit}</Td>
                  <Td><Badge tone={r.condition === "bom" ? "success" : r.condition === "regular" ? "info" : "warning"}>{CONDITION_LABEL[r.condition]}</Badge></Td>
                  <Td className="text-xs">{r.location ?? "—"}</Td>
                </Tr>
              ))}</tbody>
            </Table>
          )}
        </div>
        {isSup ? (
          <Card>
            <CardHeader title="Novo item" description={`Unidade: ${program!.unit?.name}. Marque “reservável” para ambientes usados na agenda.`} />
            <CardBody>
              <ActionForm action={saveResource} schema="resource" resetOnSuccess submitLabel="Cadastrar">
                <input type="hidden" name="unit_id" value={program!.unit_id} />
                <TextField name="name" label="Nome" required />
                <div className="grid grid-cols-2 gap-3">
                  <SelectField name="type" label="Tipo" defaultValue="equipamento">
                    {Object.entries(RESOURCE_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </SelectField>
                  <SelectField name="condition" label="Condição" defaultValue="bom">
                    {Object.entries(CONDITION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </SelectField>
                  <TextField name="quantity" type="number" step="0.01" min={0} label="Quantidade" defaultValue={1} />
                  <TextField name="measure_unit" label="Unidade" defaultValue="un" />
                  <TextField name="asset_code" label="Patrimônio" />
                  <TextField name="location" label="Local" />
                </div>
                <TextareaField name="availability_note" label="Disponibilidade" />
                <Checkbox id="rs-bk" name="bookable" label="Ambiente reservável na agenda" />
              </ActionForm>
            </CardBody>
          </Card>
        ) : null}
      </div>
    );
  }

  async function Movimentacoes() {
    const ids = (resources ?? []).map((r) => r.id);
    const { data: moves } = ids.length
      ? await supabase.from("resource_movements").select("*, resource:resources(name)").in("resource_id", ids).order("moved_on", { ascending: false }).limit(200)
      : { data: [] };
    return (
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {(moves ?? []).length === 0 ? <EmptyState title="Nenhuma movimentação" /> : (
            <Table caption="Movimentações">
              <thead><tr><Th>Data</Th><Th>Item</Th><Th>Origem → destino</Th><Th className="text-right">Qtd.</Th><Th>Aprovação</Th></tr></thead>
              <tbody>{(moves ?? []).map((m) => (
                <Tr key={m.id}><Td className="text-xs">{formatDate(m.moved_on)}</Td><Td>{m.resource?.name}</Td><Td className="text-xs">{m.from_location ?? "—"} → {m.to_location}</Td>
                  <Td className="text-right">{Number(m.quantity).toLocaleString("pt-BR")}</Td><Td className="text-xs">{m.approval_ref ?? "—"}{m.note ? <p className="text-slate-500">{m.note}</p> : null}</Td></Tr>
              ))}</tbody>
            </Table>
          )}
        </div>
        {isSup && (resources ?? []).length ? (
          <Card>
            <CardHeader title="Registrar movimentação" />
            <CardBody>
              <ActionForm action={addMovement} schema="movement" resetOnSuccess submitLabel="Registrar">
                <input type="hidden" name="program_id" value={program!.id} />
                <SelectField name="resource_id" label="Item" required defaultValue="">
                  <option value="" disabled>Selecione…</option>
                  {(resources ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </SelectField>
                <div className="grid grid-cols-2 gap-3">
                  <TextField name="from_location" label="Origem" />
                  <TextField name="to_location" label="Destino" required />
                  <TextField name="quantity" type="number" step="0.01" min={0} label="Quantidade" defaultValue={1} required />
                  <TextField name="moved_on" type="date" label="Data" defaultValue={todayLocal()} required />
                </div>
                <TextField name="approval_ref" label="Referência da aprovação" hint="Nº do processo/ofício institucional." />
                <TextField name="note" label="Observação" />
              </ActionForm>
            </CardBody>
          </Card>
        ) : null}
      </div>
    );
  }
}
