import Link from "next/link";
import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { ActionForm } from "@/components/ui/action-form";
import { SelectField, TextField, TextareaField } from "@/components/ui/field-errors";
import { ProgramPicker } from "@/components/layout/program-picker";
import { hasRole, requireAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/dates";
import { listPrograms, pickProgram, programLabel } from "@/features/programas/queries";
import { deriveAction, saveBenchmark } from "@/features/gestao-actions";
import { StatusBadge } from "@/features/acoes/components/badges";
import type { Tables } from "@/lib/database.types";

export const metadata: Metadata = { title: "Benchmarking" };
const STATUS = { planejado: "Planejado", realizado: "Realizado", cancelado: "Cancelado" } as const;

export default async function BenchmarkingPage({ searchParams }: PageProps<"/benchmarking">) {
  const sp = await searchParams;
  const access = await requireAccess();
  const supabase = await createClient();
  const programs = await listPrograms(supabase);
  const program = pickProgram(programs, sp.programa) ?? programs[0] ?? null;
  const header = <PageHeader eyebrow="RF11" title="Benchmarking" description="Referência, contato, objetivo, agenda, achados e ações derivadas (criadas no módulo de Ações)." />;
  if (!program) return <>{header}<EmptyState title="Nenhum programa no seu escopo" /></>;
  const isSup = hasRole(access, program.id, "supervisao");
  const { data: list } = await supabase
    .from("benchmarks")
    .select("*, links:benchmark_actions(action:actions(id, title, status))")
    .eq("program_id", program.id)
    .is("archived_at", null)
    .order("scheduled_on", { ascending: true, nullsFirst: false });

  return (
    <>
      {header}
      <div className="mb-6"><ProgramPicker programs={programs.map((p) => ({ id: p.id, label: programLabel(p) }))} value={program.id} /></div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {(list ?? []).length === 0 ? <EmptyState title="Nenhum benchmarking registrado">Referências da reunião de 24/11: WorldSkills — MG (#48), SP (#50), PR (#33); INOVA — São Mateus.</EmptyState> : (list ?? []).map((b) => (
            <Card key={b.id} as="article">
              <CardHeader title={b.reference} description={`${b.scheduled_on ? formatDate(b.scheduled_on) : "Data a definir"}${b.contact ? ` · ${b.contact}` : ""}`}
                actions={<Badge tone={b.status === "realizado" ? "success" : b.status === "cancelado" ? "neutral" : "info"}>{STATUS[b.status]}</Badge>} />
              <CardBody className="space-y-3 text-sm">
                <p><strong>Objetivo:</strong> {b.objective}</p>
                {b.findings ? <div><p className="font-semibold">Achados</p><p className="whitespace-pre-line text-slate-700">{b.findings}</p></div> : null}
                <div>
                  <p className="font-semibold">Ações derivadas</p>
                  {b.links.length === 0 ? <p className="text-slate-600">Nenhuma.</p> : (
                    <ul className="space-y-1">{b.links.map((l) => l.action ? (
                      <li key={l.action.id}><Link href={`/acoes/${l.action.id}`} className="text-brand-700 hover:underline">{l.action.title}</Link> <StatusBadge status={l.action.status} /></li>
                    ) : null)}</ul>
                  )}
                </div>
                {isSup ? (
                  <div className="grid gap-4 border-t border-slate-100 pt-3 md:grid-cols-2">
                    <details><summary className="cursor-pointer text-brand-700">Atualizar / registrar achados</summary><div className="mt-2"><BenchmarkForm programId={program.id} b={b} /></div></details>
                    <details><summary className="cursor-pointer text-brand-700">+ Criar ação derivada</summary>
                      <ActionForm action={deriveAction} schema="derivedAction" resetOnSuccess submitLabel="Criar ação" submitVariant="secondary" className="mt-2 space-y-2">
                        <input type="hidden" name="benchmark_id" value={b.id} />
                        <input type="hidden" name="program_id" value={program.id} />
                        <TextField id={`da-${b.id}`} name="title" label="Ação" required />
                        <TextField id={`dd-${b.id}`} name="due_date" type="date" label="Prazo" />
                      </ActionForm>
                    </details>
                  </div>
                ) : null}
              </CardBody>
            </Card>
          ))}
        </div>
        {isSup ? (
          <Card>
            <CardHeader title="Novo benchmarking" />
            <CardBody><BenchmarkForm programId={program.id} /></CardBody>
          </Card>
        ) : null}
      </div>
    </>
  );
}

function BenchmarkForm({ programId, b }: { programId: string; b?: Tables<"benchmarks"> }) {
  const k = b?.id ?? "novo";
  return (
    <ActionForm action={saveBenchmark} schema="benchmark" resetOnSuccess={!b}>
      {b ? <input type="hidden" name="id" value={b.id} /> : null}
      <input type="hidden" name="program_id" value={programId} />
      <TextField id={`r-${k}`} name="reference" label="Referência (DR/unidade/instituição)" defaultValue={b?.reference} required />
      <TextField id={`c-${k}`} name="contact" label="Contato (mínimo necessário)" defaultValue={b?.contact ?? ""} />
      <TextareaField id={`o-${k}`} name="objective" label="Objetivo" defaultValue={b?.objective} required />
      <div className="grid grid-cols-2 gap-3">
        <TextField id={`d-${k}`} name="scheduled_on" type="date" label="Data" defaultValue={b?.scheduled_on ?? ""} />
        <SelectField id={`s-${k}`} name="status" label="Situação" defaultValue={b?.status ?? "planejado"}>
          {Object.entries(STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </SelectField>
      </div>
      <TextareaField id={`f-${k}`} name="findings" label="Achados" defaultValue={b?.findings ?? ""} hint="Obrigatório para marcar como realizado." />
    </ActionForm>
  );
}
