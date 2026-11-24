import type { Metadata } from "next";
import { PlannedModule } from "@/components/layout/planned-module";

export const metadata: Metadata = { title: "WorldSkills" };

export default function Page() {
  return <PlannedModule rf={"RF07"} title={"WorldSkills"} stage={2} summary={"Plano por competência, sessões, presença, simulados, erros, causa raiz, plano de melhoria e rampa configurável."} requirements={["Alocação por pessoa com jornada e percentual por vigência (sem fixar 25h)", "Competências por ocupação (#33, #48, #50) com pesos após validação dos documentos técnicos oficiais", "Plano versionado: competência, objetivo, atividade, horas, responsável, recurso, evidência, critério de aceite", "Sessões com duração efetiva e presença individual", "Simulados: tipo, versão, critérios, nota bruta, escala, duração, erros e revisão", "Rampa mensal cadastrável; nota bruta não convertida sem metodologia validada", "Indicadores: CH ≥95%, execução 100%, simulados parcial/completo/externo, tempo de prova, análise de erros, acidentes zero — com denominador, período e fonte"]} acceptance={["CH correta com jornada variável, ausência e equipe dupla (CH = minutos efetivos / previstos; denominador zero = N/A)", "Horas de treinador não multiplicadas por alunos", "Comparar apenas escalas equivalentes"]} pending={["Vínculo orientadores/ocupações (reunião 30/11–04/12)", "Composição A/B e formato de equipe", "Frequência de simulados (parcial semanal, completo mensal ou sexta-feira)", "Escalas de pontuação e pontos intermediários da rampa"]} />;
}
