import {
  BarChart3, CalendarDays, ClipboardCheck, FileText, FolderKanban, Gauge, Lightbulb, ListChecks, PiggyBank,
  Settings, ShieldAlert, Telescope, Trophy, Users, Wrench, NotebookPen,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: typeof Gauge };

/** Menu enxuto (decisão 25/11): o essencial à vista; o restante em “Mais”. */
export const NAV_MAIN: NavItem[] = [
  { href: "/dashboard", label: "Painel", icon: Gauge },
  { href: "/acoes", label: "Ações", icon: FolderKanban },
  { href: "/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/equipes", label: "Equipes", icon: Users },
];

export const NAV_MORE: NavItem[] = [
  { href: "/worldskills", label: "WorldSkills", icon: ClipboardCheck },
  { href: "/acompanhamentos", label: "Fechamento semanal", icon: NotebookPen },
  { href: "/inova", label: "INOVA SENAI", icon: Lightbulb },
  { href: "/checklists", label: "Checklists", icon: ListChecks },
  { href: "/documentos", label: "Documentos", icon: FileText },
  { href: "/recursos", label: "Recursos", icon: Wrench },
  { href: "/orcamento", label: "Orçamento", icon: PiggyBank },
  { href: "/riscos", label: "Riscos", icon: ShieldAlert },
  { href: "/benchmarking", label: "Benchmarking", icon: Telescope },
  { href: "/relatorios", label: "Relatórios", icon: BarChart3 },
  { href: "/competicoes", label: "Competições", icon: Trophy },
];

export const NAV_SETTINGS: NavItem = { href: "/configuracoes", label: "Configurações", icon: Settings };
