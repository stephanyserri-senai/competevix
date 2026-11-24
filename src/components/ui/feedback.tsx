import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, Inbox, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";

type AlertTone = "info" | "warning" | "error" | "success";
const alertStyles: Record<AlertTone, string> = {
  info: "border-sky-200 bg-sky-50 text-sky-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  error: "border-red-200 bg-red-50 text-red-900",
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
};
const icons = { info: Info, warning: AlertTriangle, error: XCircle, success: CheckCircle2 };

export function Alert({ tone = "info", title, children, className }: { tone?: AlertTone; title?: ReactNode; children?: ReactNode; className?: string }) {
  const Icon = icons[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("flex gap-3 rounded-md border p-3 text-sm", alertStyles[tone], className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 space-y-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div>{children}</div> : null}
      </div>
    </div>
  );
}

/** Estado vazio: deixa claro que não há registro (não é "zero"). */
export function EmptyState({ title, children, action }: { title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
      <Inbox className="size-8 text-slate-400" aria-hidden />
      <p className="font-medium text-slate-800">{title}</p>
      {children ? <div className="max-w-md text-sm text-slate-600">{children}</div> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-slate-200", className)} />;
}

export function LoadingPage({ label = "Carregando…" }: { label?: string }) {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-4">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}
