import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { ActionForm } from "@/components/ui/action-form";
import { SelectField, TextField } from "@/components/ui/field-errors";
import { ProgramPicker } from "@/components/layout/program-picker";
import { hasRole, requireAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime, todayLocal } from "@/lib/dates";
import { listPrograms, pickProgram, programLabel } from "@/features/programas/queries";
import { addBudgetTx, cancelBudgetTx, saveBudgetItem } from "@/features/gestao-actions";
import { CATEGORY_LABEL, TX_LABEL, formatBRL, summarize, type TxType } from "@/features/orcamento/domain";

export const metadata: Metadata = { title: "Orçamento" };

export default async function OrcamentoPage({ searchParams }: PageProps<"/orcamento">) {
  const sp = await searchParams;
  const access = await requireAccess();
  const supabase = await createClient();
  const programs = await listPrograms(supabase);
  const visible = programs.filter((p) => hasRole(access, p.id, "supervisao", "gestao"));
  const program = pickProgram(visible, sp.programa) ?? visible[0] ?? null;
  const header = (
    <PageHeader eyebrow="RF10" title="Orçamento"
      description="Estimado, solicitado, aprovado, comprometido e realizado por item, com comprovação. Saldo = aprovado − compromissos em aberto − realizado. Registro interno: não substitui autorização institucional." />
  );
  if (!program) return <>{header}<EmptyState title="Sem acesso a orçamento">O orçamento é visível apenas para supervisão e gestão do programa.</EmptyState></>;
  const isSup = hasRole(access, program.id, "supervisao");
  const isGestao = hasRole(access, program.id, "gestao");

  const [{ data: summary }, { data: txs }, { data: requests }] = await Promise.all([
    supabase.from("budget_item_summary").select("*").eq("program_id", program.id).order("category"),
    supabase.from("budget_transactions").select("*, creator:profiles!budget_transactions_created_by_fkey(display_name)").eq("program_id", program.id).order("occurred_on", { ascending: false }),
    supabase.from("resource_requests").select("id, title, status").eq("program_id", program.id).in("status", ["aprovada", "atendida", "em_analise", "enviada"]),
  ]);
  const items = (summary ?? []).filter((s) => !s.archived_at);
  const all = summarize((txs ?? []).map((t) => ({ id: t.id, type: t.type, amount: Number(t.amount), parent_id: t.parent_id, cancelled_at: t.cancelled_at })));
  const totalEstimated = items.reduce((s, i) => s + Number(i.estimated ?? 0), 0);
  const viewTotal = items.reduce((s, i) => s + Math.round(Number(i.balance ?? 0) * 100), 0) / 100;
  const reconciled = Math.abs(viewTotal - all.balance) < 0.005;

  return (
    <>
      {header}
      <div className="mb-6"><ProgramPicker programs={visible.map((p) => ({ id: p.id, label: programLabel(p) }))} value={program.id} /></div>
      <section aria-label="Totais do programa" className="mb-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Estimado", totalEstimated], ["Solicitado", all.requested], ["Aprovado", all.approved],
          ["Compromissos em aberto", all.openCommitments], ["Realizado", all.realized], ["Saldo", all.balance],
        ].map(([l, v]) => (
          <div key={l as string} className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-xs font-medium text-slate-600">{l}</p>
            <p className={`text-lg font-bold ${l === "Saldo" && (v as number) < 0 ? "text-red-700" : "text-brand-900"}`}>{formatBRL(v as number)}</p>
          </div>
        ))}
      </section>
      <Alert tone={reconciled ? "success" : "error"} className="mb-6" title={reconciled ? "Saldo reconciliado" : "Divergência de saldo"}>
        Soma dos saldos por item (banco) {formatBRL(viewTotal)} × cálculo pelos lançamentos {formatBRL(all.balance)}. Lançamentos cancelados não entram; realizado vinculado consome o compromisso.
      </Alert>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {items.length === 0 ? <EmptyState title="Nenhum item orçamentário" /> : (
            <Table caption="Itens orçamentários">
              <thead><tr><Th>Item</Th><Th className="text-right">Estimado</Th><Th className="text-right">Aprovado</Th><Th className="text-right">Compr. aberto</Th><Th className="text-right">Realizado</Th><Th className="text-right">Saldo</Th></tr></thead>
              <tbody>{items.map((i) => (
                <Tr key={i.item_id!}>
                  <Td><span className="font-medium">{i.description}</span><p className="text-xs text-slate-500">{CATEGORY_LABEL[i.category!]}</p></Td>
                  <Td className="text-right text-xs">{formatBRL(i.estimated)}</Td><Td className="text-right text-xs">{formatBRL(i.approved)}</Td>
                  <Td className="text-right text-xs">{formatBRL(i.open_commitments)}</Td><Td className="text-right text-xs">{formatBRL(i.realized)}</Td>
                  <Td className={`text-right text-sm font-semibold ${Number(i.balance) < 0 ? "text-red-700" : ""}`}>{formatBRL(i.balance)}</Td>
                </Tr>
              ))}</tbody>
            </Table>
          )}
          <Card>
            <CardHeader title="Lançamentos" description="Imutáveis; correções por cancelamento justificado." />
            <CardBody>
              {(txs ?? []).length === 0 ? <p className="text-sm text-slate-600">Nenhum lançamento.</p> : (
                <Table caption="Lançamentos">
                  <thead><tr><Th>Data</Th><Th>Item</Th><Th>Tipo</Th><Th className="text-right">Valor</Th><Th>Referência</Th>{isSup ? <Th><span className="sr-only">Ações</span></Th> : null}</tr></thead>
                  <tbody>{(txs ?? []).map((t) => (
                    <Tr key={t.id} className={t.cancelled_at ? "opacity-60" : ""}>
                      <Td className="text-xs">{formatDate(t.occurred_on)}</Td>
                      <Td className="text-xs">{items.find((i) => i.item_id === t.item_id)?.description ?? "—"}</Td>
                      <Td><Badge tone={t.type === "realizado" ? "success" : t.type === "comprometido" ? "warning" : t.type === "aprovado" ? "brand" : "neutral"}>{TX_LABEL[t.type as TxType]}</Badge>
                        {t.parent_id ? <span className="ml-1 text-xs text-slate-500">↳ compromisso</span> : null}
                        {t.cancelled_at ? <p className="text-xs text-red-700">Cancelado: {t.cancel_note}</p> : null}</Td>
                      <Td className="text-right">{formatBRL(t.amount)}</Td>
                      <Td className="text-xs">{t.approval_ref ?? "—"}<p className="text-slate-500">{t.creator?.display_name} · {formatDateTime(t.created_at)}</p></Td>
                      {isSup ? <Td>{!t.cancelled_at ? (
                        <details><summary className="cursor-pointer text-xs text-brand-700">Cancelar</summary>
                          <ActionForm action={cancelBudgetTx} schema="cancelTx" submitLabel="Confirmar" submitVariant="danger" className="mt-2 space-y-2">
                            <input type="hidden" name="id" value={t.id} />
                            <TextField id={`cn-${t.id}`} name="cancel_note" label="Justificativa" required />
                          </ActionForm>
                        </details>) : null}</Td> : null}
                    </Tr>
                  ))}</tbody>
                </Table>
              )}
            </CardBody>
          </Card>
        </div>
        <div className="space-y-6">
          {(isSup || isGestao) && items.length ? (
            <Card>
              <CardHeader title="Novo lançamento" description={isSup ? "Realizado pode consumir um compromisso (evita dupla contagem)." : "Gestão registra aprovações (delegação orçamentária)."} />
              <CardBody>
                <ActionForm action={addBudgetTx} schema="budgetTx" resetOnSuccess submitLabel="Lançar">
                  <input type="hidden" name="program_id" value={program.id} />
                  <SelectField name="item_id" label="Item" required defaultValue="">
                    <option value="" disabled>Selecione…</option>
                    {items.map((i) => <option key={i.item_id!} value={i.item_id!}>{i.description}</option>)}
                  </SelectField>
                  <div className="grid grid-cols-2 gap-3">
                    <SelectField name="type" label="Tipo" defaultValue={isSup ? "solicitado" : "aprovado"}>
                      {(isSup ? (Object.keys(TX_LABEL) as TxType[]) : (["aprovado"] as TxType[])).map((k) => <option key={k} value={k}>{TX_LABEL[k]}</option>)}
                    </SelectField>
                    <TextField name="amount" type="number" step="0.01" min={0} label="Valor (R$)" required />
                    <TextField name="occurred_on" type="date" label="Data" defaultValue={todayLocal()} required />
                    <TextField name="approval_ref" label="Referência" hint="Processo, empenho, NF…" />
                  </div>
                  {isSup ? (
                    <SelectField name="parent_id" label="Consome o compromisso (só para realizado)" defaultValue="">
                      <option value="">—</option>
                      {(txs ?? []).filter((t) => t.type === "comprometido" && !t.cancelled_at).map((t) => (
                        <option key={t.id} value={t.id}>{items.find((i) => i.item_id === t.item_id)?.description} · {formatBRL(t.amount)} · {formatDate(t.occurred_on)}</option>
                      ))}
                    </SelectField>
                  ) : null}
                  <TextField name="note" label="Observação" />
                </ActionForm>
                <p className="mt-2 text-xs text-slate-500">Comprovantes: envie em Documentos (classificação restrita) e cite a referência aqui.</p>
              </CardBody>
            </Card>
          ) : null}
          {isSup ? (
            <Card>
              <CardHeader title="Novo item" />
              <CardBody>
                <ActionForm action={saveBudgetItem} schema="budgetItem" resetOnSuccess submitLabel="Criar item">
                  <input type="hidden" name="program_id" value={program.id} />
                  <TextField name="description" label="Descrição" required />
                  <div className="grid grid-cols-2 gap-3">
                    <SelectField name="category" label="Categoria" defaultValue="insumos">
                      {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </SelectField>
                    <TextField name="estimated" type="number" step="0.01" min={0} label="Estimado (R$)" defaultValue={0} />
                  </div>
                  <SelectField name="request_id" label="Solicitação de recurso (opcional)" defaultValue="">
                    <option value="">—</option>
                    {(requests ?? []).map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
                  </SelectField>
                </ActionForm>
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
