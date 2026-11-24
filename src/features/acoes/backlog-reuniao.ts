/**
 * Backlog inicial — reunião de 24/11/2026 (PRD §11).
 * Regras: ações abertas, responsáveis a definir, SEM datas inventadas, salvo a janela
 * da reunião com orientadores (30/11–04/12/2026). O texto replica o PRD; itens
 * ambíguos ficam sinalizados para esclarecimento em vez de serem interpretados.
 * A Supervisão escolhe o programa de destino de cada grupo na importação.
 */
export type BacklogItem = {
  key: string;
  title: string;
  description?: string;
  start_date?: string;
  due_date?: string;
};

export type BacklogGroup = { label: string; hint: string; items: BacklogItem[] };

export const BACKLOG_ORIGIN = "Reunião de 24/11/2026 (PRD v0.1 §11)";

export const BACKLOG_REUNIAO_2026_11_24: Record<"geral" | "worldskills" | "inova", BacklogGroup> = {
  geral: {
    label: "Geral",
    hint: "Itens de gestão integrada; escolha o programa que os acompanhará.",
    items: [
      { key: "r20261124-geral-agenda", title: "Definir agenda mensal das competições" },
      { key: "r20261124-geral-cadencia", title: "Definir cadência e checklists semanais" },
      { key: "r20261124-geral-estrutura", title: "Levantar estrutura e investimentos necessários" },
      { key: "r20261124-geral-tempo", title: "Definir tempo dos orientadores" },
    ],
  },
  worldskills: {
    label: "WorldSkills",
    hint: "Ocupações e orientadores ainda não atribuídos (PRD §6).",
    items: [
      {
        key: "r20261124-ws-reuniao-orientadores",
        title: "Reunião com Pardinho, André e Aminta",
        description: "Janela indicada na reunião: 30/11 a 04/12/2026. Não atribuir ocupações antes desta reunião.",
        start_date: "2026-11-30",
        due_date: "2026-12-04",
      },
      { key: "r20261124-ws-ch-50", title: "Alinhar 50% de carga horária dos orientadores e períodos", description: "Infográfico indica 5h/dia; reunião citou 50% da jornada. Parametrizar por pessoa e vigência." },
      { key: "r20261124-ws-plano", title: "Elaborar plano com orientadores e suplentes" },
      { key: "r20261124-ws-insumos", title: "Levantar insumos e ferramentas" },
      { key: "r20261124-ws-visita-automotiva", title: "Organizar visita automotiva" },
      { key: "r20261124-ws-smart40", title: "Analisar movimentação da Smart 4.0", description: "Registrar como necessidade a analisar (PRD RF09)." },
      { key: "r20261124-ws-estagio-bolsa", title: "Tratar estágio + bolsa dos competidores", description: "Decisão pendente (PRD §14)." },
      { key: "r20261124-ws-turma", title: "Avaliar abertura de turma" },
      { key: "r20261124-ws-benchmarking", title: "Realizar benchmarking MG/SP/PR", description: "Referências da reunião: #33 PR, #48 MG, #50 SP." },
      { key: "r20261124-ws-alimentacao", title: "Tratar alimentação dos competidores", description: "Decisão pendente (PRD §14)." },
      { key: "r20261124-ws-napi", title: "Agendar NAPI", description: "Somente encaminhamento administrativo; sem dados clínicos (PRD §4)." },
      { key: "r20261124-ws-engajamento", title: "Ativação de engajamento dos competidores" },
    ],
  },
  inova: {
    label: "INOVA SENAI",
    hint: "Itens do INOVA citados na reunião.",
    items: [
      { key: "r20261124-inova-benchmarking", title: "Benchmarking com São Mateus" },
      { key: "r20261124-inova-renisson", title: "Verificar com Renisson alunos que sairão e quem irá ao nacional" },
      {
        key: "r20261124-inova-lista",
        title: "Esclarecer anotação “Lista” (incompleta)",
        description: "Anotação incompleta na reunião; esclarecer o significado antes de executar.",
      },
    ],
  },
};
