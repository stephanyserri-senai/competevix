import type { Metadata } from "next";
import { PlannedModule } from "@/components/layout/planned-module";

export const metadata: Metadata = { title: "Benchmarking" };

export default function Page() {
  return <PlannedModule rf={"RF11"} title={"Benchmarking"} stage={4} summary={"Referência, contato, objetivo, agenda, achados e ações derivadas."} requirements={["Registro de referências (ex.: MG, SP, PR; São Mateus)", "Agenda vinculada à Agenda do programa", "Ações derivadas vinculadas ao módulo de Ações"]} acceptance={["Achados rastreáveis até as ações derivadas"]} />;
}
