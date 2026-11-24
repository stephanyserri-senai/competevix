import type { Metadata } from "next";
import { PlannedModule } from "@/components/layout/planned-module";

export const metadata: Metadata = { title: "Relatórios" };

export default function Page() {
  return <PlannedModule rf={"RF14"} title={"Relatórios"} stage={4} summary={"Exportação CSV e relatório imprimível semanal/mensal, com filtros, data de corte e metodologia."} requirements={["CSV e versão imprimível", "Filtros, data de corte e metodologia explícitos", "Indicadores reproduzíveis a partir dos registros"]} acceptance={["Exportação respeita permissões (RLS)", "Indicadores reproduzíveis"]} />;
}
