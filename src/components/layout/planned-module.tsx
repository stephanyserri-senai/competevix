import { CalendarRange } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";

/**
 * Página de módulo planejado: documenta o escopo do PRD e a etapa prevista,
 * SEM formulários ou dados simulados (PRD §13: sem telas falsas apresentadas como funcionais).
 */
export function PlannedModule({
  rf, title, stage, summary, requirements, acceptance, pending,
}: {
  rf: string; title: string; stage: number; summary: string; requirements: string[]; acceptance: string[]; pending?: string[];
}) {
  return (
    <>
      <PageHeader eyebrow={rf} title={title} description={summary} />
      <Alert tone="info" title={`Módulo previsto na etapa ${stage}`} className="mb-6">
        Esta área ainda não registra dados. O modelo de dados e as permissões serão entregues na etapa {stage}, sobre a fundação já implementada (programas, equipes, documentos, auditoria).
      </Alert>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Escopo previsto (PRD)" />
          <CardBody><ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-800">{requirements.map((r) => <li key={r}>{r}</li>)}</ul></CardBody>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Critérios de aceite" />
            <CardBody><ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-800">{acceptance.map((r) => <li key={r}>{r}</li>)}</ul></CardBody>
          </Card>
          {pending?.length ? (
            <Card>
              <CardHeader title="Decisões pendentes" />
              <CardBody>
                <ul className="space-y-1.5 text-sm text-slate-800">{pending.map((r) => <li key={r} className="flex gap-2"><CalendarRange className="mt-0.5 size-4 shrink-0 text-accent-600" aria-hidden />{r}</li>)}</ul>
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
