import { Badge, type Tone } from "@/components/ui/badge";
import { PRIORITY_LABEL, STATUS_LABEL, dueLabel, isOverdue, type ActionPriority, type ActionStatus } from "../domain";
import { formatDate } from "@/lib/dates";

const STATUS_TONE: Record<ActionStatus, Tone> = {
  aberta: "info",
  em_andamento: "brand",
  bloqueada: "warning",
  concluida: "success",
  cancelada: "neutral",
};
const PRIORITY_TONE: Record<ActionPriority, Tone> = { baixa: "neutral", media: "info", alta: "accent", critica: "danger" };

export function StatusBadge({ status }: { status: ActionStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>;
}
export function PriorityBadge({ priority }: { priority: ActionPriority }) {
  return <Badge tone={PRIORITY_TONE[priority]}>{PRIORITY_LABEL[priority]}</Badge>;
}
export function DueInfo({ due_date, status }: { due_date: string | null; status: ActionStatus }) {
  const overdue = isOverdue({ due_date, status });
  const label = dueLabel({ due_date, status });
  return (
    <span className="whitespace-nowrap text-xs">
      {due_date ? formatDate(due_date) : "—"}
      {label ? <span className={overdue ? "ml-1 font-semibold text-red-700" : "ml-1 text-slate-500"}>({label})</span> : null}
    </span>
  );
}
