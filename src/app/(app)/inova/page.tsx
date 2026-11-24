import type { Metadata } from "next";
import { PlannedModule } from "@/components/layout/planned-module";

export const metadata: Metadata = { title: "INOVA SENAI" };

export default function Page() {
  return <PlannedModule rf={"RF08"} title={"INOVA SENAI"} stage={3} summary={"Ficha de projeto, funil com evidências, validação industrial, protótipo, modelo de negócio e bancas versionadas."} requirements={["Funil: prospecção → seleção → anterioridade → validação do problema → protótipo → validação técnica/financeira → banca/pitch → prioritário", "Avanço de etapa exige evidências e revisão da supervisão (transacional)", "Rubrica interna preliminar versionada: inovação 40 (8 critérios 0–5), pitch 30, proposta de valor 20, viabilidade/mercado 10", "Bancas com avaliadores temporários; média apenas de submissões completas, sem arredondar antes da classificação", "Avaliação publicada imutável; revisão cria versão"]} acceptance={["Impedir notas fora do limite", "Impedir publicação incompleta e avanço sem evidência", "Manter histórico de etapas e versões"]} pending={["Rubrica oficial vs. interna", "10 iniciais → 3 prioritários por escola (confirmar)", "Situação dos alunos para o nacional (Renisson)"]} />;
}
