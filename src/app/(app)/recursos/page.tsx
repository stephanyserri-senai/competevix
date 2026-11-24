import type { Metadata } from "next";
import { PlannedModule } from "@/components/layout/planned-module";

export const metadata: Metadata = { title: "Recursos" };

export default function Page() {
  return <PlannedModule rf={"RF09"} title={"Recursos"} stage={4} summary={"Inventário, ambientes, insumos, disponibilidade, solicitações e movimentações."} requirements={["Inventário e ambientes por unidade", "Solicitações: rascunho → enviada → análise → aprovada/rejeitada → atendida/cancelada, com decisor e data", "Movimentações com origem/destino e aprovação", "Smart 4.0 registrada como necessidade a analisar", "Conflito de agenda com ambientes"]} acceptance={["Recurso bloqueante gera alerta", "Aprovação no portal é registro interno, não autorização institucional"]} pending={["Disponibilidade de ambientes"]} />;
}
