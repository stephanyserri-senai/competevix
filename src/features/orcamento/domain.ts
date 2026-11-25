/**
 * Orçamento (PRD RF10, §9) — mesma regra da visão budget_item_summary do banco:
 * saldo = aprovado − compromissos ainda não realizados − realizado.
 * Um realizado vinculado a um compromisso consome esse compromisso (sem dupla contagem).
 * Lançamentos cancelados não entram em nenhuma soma.
 */
export type TxType = "solicitado" | "aprovado" | "comprometido" | "realizado";
export type Tx = { id: string; type: TxType; amount: number; parent_id: string | null; cancelled_at: string | null };

const cents = (v: number) => Math.round(v * 100);
const fromCents = (c: number) => c / 100;

export function summarize(txs: Tx[]) {
  const live = txs.filter((t) => !t.cancelled_at);
  const sum = (type: TxType) => live.filter((t) => t.type === type).reduce((s, t) => s + cents(t.amount), 0);
  const openCommit = live
    .filter((t) => t.type === "comprometido")
    .reduce((s, c) => {
      const used = live.filter((r) => r.parent_id === c.id).reduce((u, r) => u + cents(r.amount), 0);
      return s + Math.max(cents(c.amount) - used, 0);
    }, 0);
  const approved = sum("aprovado");
  const realized = sum("realizado");
  return {
    requested: fromCents(sum("solicitado")),
    approved: fromCents(approved),
    committed: fromCents(sum("comprometido")),
    realized: fromCents(realized),
    openCommitments: fromCents(openCommit),
    balance: fromCents(approved - openCommit - realized),
  };
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const formatBRL = (v: number | string | null | undefined) => (v === null || v === undefined ? "—" : brl.format(Number(v)));

export const CATEGORY_LABEL = {
  insumos: "Insumos", equipamentos: "Equipamentos", servicos: "Serviços", viagens: "Viagens",
  alimentacao: "Alimentação", bolsas: "Bolsas", outros: "Outros",
} as const;
export const TX_LABEL: Record<TxType, string> = { solicitado: "Solicitado", aprovado: "Aprovado", comprometido: "Comprometido", realizado: "Realizado" };
