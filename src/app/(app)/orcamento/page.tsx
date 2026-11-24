import type { Metadata } from "next";
import { PlannedModule } from "@/components/layout/planned-module";

export const metadata: Metadata = { title: "Orçamento" };

export default function Page() {
  return <PlannedModule rf={"RF10"} title={"Orçamento"} stage={4} summary={"Estimado, solicitado, aprovado, comprometido e realizado por item, com comprovação."} requirements={["Itens por programa e categoria (numeric(14,2))", "Transações vinculadas para evitar dupla contagem", "Saldo = aprovado − comprometido não realizado − realizado", "Comprovantes como documentos privados"]} acceptance={["Saldo reconciliado", "Exportação respeita permissões"]} pending={["Orçamento disponível e delegação de decisões à gestão"]} />;
}
