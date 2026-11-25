import {
  BarChart3, Building2, CalendarDays, ClipboardCheck, FileText, FolderKanban, Gauge, Lightbulb,
  ListChecks, PiggyBank, Settings, ShieldAlert, Trophy, Users, Wrench, Telescope, NotebookPen,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: typeof Gauge;
  /** Etapa do plano em que a funcionalidade é entregue (1 = disponível no MVP 1) */
  stage: 1 | 2 | 3 | 4;
  rf?: string;
};

export const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: "Gestão",
    items: [
      { href: "/dashboard", label: "Painel", icon: Gauge, stage: 1, rf: "RF01" },
      { href: "/competicoes", label: "Competições", icon: Trophy, stage: 1, rf: "RF02" },
      { href: "/equipes", label: "Equipes e pessoas", icon: Users, stage: 1, rf: "RF03" },
      { href: "/agenda", label: "Agenda", icon: CalendarDays, stage: 1, rf: "RF04" },
      { href: "/acoes", label: "Ações", icon: FolderKanban, stage: 1, rf: "RF05" },
      { href: "/checklists", label: "Checklists", icon: ListChecks, stage: 1 },
      { href: "/documentos", label: "Documentos", icon: FileText, stage: 1, rf: "RF13" },
    ],
  },
  {
    section: "Desempenho",
    items: [
      { href: "/acompanhamentos", label: "Acompanhamentos", icon: NotebookPen, stage: 2, rf: "RF06" },
      { href: "/worldskills", label: "WorldSkills", icon: ClipboardCheck, stage: 2, rf: "RF07" },
      { href: "/inova", label: "INOVA SENAI", icon: Lightbulb, stage: 3, rf: "RF08" },
    ],
  },
  {
    section: "Recursos e análise",
    items: [
      { href: "/recursos", label: "Recursos", icon: Wrench, stage: 4, rf: "RF09" },
      { href: "/orcamento", label: "Orçamento", icon: PiggyBank, stage: 4, rf: "RF10" },
      { href: "/benchmarking", label: "Benchmarking", icon: Telescope, stage: 4, rf: "RF11" },
      { href: "/riscos", label: "Riscos", icon: ShieldAlert, stage: 4, rf: "RF12" },
      { href: "/relatorios", label: "Relatórios", icon: BarChart3, stage: 4, rf: "RF14" },
    ],
  },
  {
    section: "Administração",
    items: [{ href: "/configuracoes", label: "Configurações", icon: Settings, stage: 1, rf: "RF15" }],
  },
];

export const UNIT_ICON = Building2;

/** Etapa já entregue: itens com etapa maior aparecem marcados como previstos. */
export const CURRENT_STAGE = 3;
