export const RESOURCE_TYPE_LABEL = {
  equipamento: "Equipamento", ambiente: "Ambiente", ferramenta: "Ferramenta", insumo: "Insumo", software: "Software", outro: "Outro",
} as const;
export const CONDITION_LABEL = { bom: "Bom", regular: "Regular", ruim: "Ruim", indisponivel: "Indisponível" } as const;
export const REQUEST_STATUS_LABEL = {
  rascunho: "Rascunho", enviada: "Enviada", em_analise: "Em análise", aprovada: "Aprovada",
  rejeitada: "Rejeitada", atendida: "Atendida", cancelada: "Cancelada",
} as const;
export type RequestStatus = keyof typeof REQUEST_STATUS_LABEL;

/** Próximos status possíveis (mesma regra de set_request_status no banco). */
export function nextRequestStatuses(from: RequestStatus, isSupervisor: boolean): RequestStatus[] {
  const out: RequestStatus[] = [];
  if (from === "rascunho") out.push("enviada");
  if (isSupervisor && from === "enviada") out.push("em_analise");
  if (isSupervisor && (from === "enviada" || from === "em_analise")) out.push("aprovada", "rejeitada");
  if (isSupervisor && from === "aprovada") out.push("atendida");
  if (["rascunho", "enviada", "em_analise", "aprovada"].includes(from)) out.push("cancelada");
  return out;
}
