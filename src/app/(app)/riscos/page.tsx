import type { Metadata } from "next";
import { PlannedModule } from "@/components/layout/planned-module";

export const metadata: Metadata = { title: "Riscos" };

export default function Page() {
  return <PlannedModule rf={"RF12"} title={"Riscos"} stage={4} summary={"Probabilidade e impacto 1–5, mitigação, responsável, prazo e revisão."} requirements={["Matriz probabilidade × impacto (1–5)", "Mitigação, responsável, prazo e revisão periódica", "Histórico de reavaliações"]} acceptance={["Valores fora de 1–5 rejeitados pelo banco"]} />;
}
