import type { Metadata } from "next";
import { PlannedModule } from "@/components/layout/planned-module";

export const metadata: Metadata = { title: "Acompanhamentos semanais" };

export default function Page() {
  return <PlannedModule rf={"RF06"} title={"Acompanhamentos semanais"} stage={2} summary={"Planejamento e fechamento semanal por equipe, com revisão e devolução pela supervisão."} requirements={["Planejamento e fechamento semanal por equipe (único por equipe/semana)", "Horas previstas e realizadas, resultados, dificuldades, intervenção e próximas entregas", "Fluxo rascunho → enviado → em revisão → aprovado/devolvido; correção após aprovação gera versão", "Alerta de relatório não enviado"]} acceptance={["Supervisão revisa e devolve com comentário", "Relatório aprovado é imutável; correção cria nova versão"]} pending={["Cadência oficial de fechamento", "Jornada real e período dos orientadores"]} />;
}
