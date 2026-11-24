import Link from "next/link";
import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { RunButton } from "@/components/ui/run-button";
import { requireAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/dates";
import { markAllRead } from "@/features/notificacoes-actions";

export const metadata: Metadata = { title: "Notificações" };

export default async function NotificacoesPage() {
  await requireAccess();
  const supabase = await createClient();
  const { data } = await supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(100);
  return (
    <>
      <PageHeader
        title="Notificações"
        description="Alertas internos gerados pela rotina agendada: prazo vencido e checklist pendente. Resolvidos automaticamente quando a condição cessa. Sem envio externo no MVP."
        actions={<RunButton label="Marcar todas como lidas" variant="secondary" onRun={markAllRead} />}
      />
      {(data ?? []).length === 0 ? <EmptyState title="Nenhuma notificação" /> : (
        <Card>
          <CardBody>
            <ul className="divide-y divide-slate-100">
              {(data ?? []).map((n) => (
                <li key={n.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span>
                    {n.link ? <Link href={n.link} className={n.read_at ? "text-slate-700 hover:underline" : "font-semibold text-brand-800 hover:underline"}>{n.title}</Link> : n.title}
                    <span className="ml-2 text-xs text-slate-500">{formatDateTime(n.created_at)}</span>
                  </span>
                  {n.resolved_at ? <Badge tone="success">Resolvida</Badge> : n.read_at ? <Badge>Lida</Badge> : <Badge tone="accent">Nova</Badge>}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </>
  );
}
