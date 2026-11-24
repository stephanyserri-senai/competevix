import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { ActionForm } from "@/components/ui/action-form";
import { TextField } from "@/components/ui/field-errors";
import { Checkbox } from "@/components/ui/field";
import { RunButton } from "@/components/ui/run-button";
import { hasRole, requireAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/dates";
import { addItem, newVersion, publishTemplate, removeItem } from "@/features/checklists/actions";
import { CADENCE_LABEL, TEMPLATE_STATUS_LABEL } from "@/features/checklists/domain";

export default async function ModeloPage({ params }: PageProps<"/checklists/modelos/[id]">) {
  const { id } = await params;
  const access = await requireAccess();
  const supabase = await createClient();
  const { data: t } = await supabase.from("checklist_templates").select("*").eq("id", id).maybeSingle();
  if (!t) notFound();
  const [{ data: items }, { data: family }] = await Promise.all([
    supabase.from("checklist_items").select("*").eq("template_id", id).order("position"),
    supabase.from("checklist_templates").select("id, version, status").eq("family_id", t.family_id).order("version"),
  ]);
  const isSup = hasRole(access, t.program_id, "supervisao");
  const draft = t.status === "rascunho";

  return (
    <>
      <PageHeader
        eyebrow={`Modelo de checklist · v${t.version}`}
        title={t.name}
        description={`${CADENCE_LABEL[t.cadence]} · ${t.scope === "equipe" ? "por equipe" : "programa"} · ${TEMPLATE_STATUS_LABEL[t.status]}${t.published_at ? ` em ${formatDateTime(t.published_at)}` : ""}`}
        actions={
          <>
            <Link href={`/checklists?programa=${t.program_id}`} className="text-sm text-brand-700 hover:underline">← Checklists</Link>
            {isSup && draft ? <RunButton variant="primary" label="Publicar" onRun={publishTemplate.bind(null, id)} confirm="Publicar este modelo? Itens ficam imutáveis e versões anteriores serão substituídas." /> : null}
            {isSup && !draft && t.status === "publicado" ? <RunButton variant="secondary" label="Criar nova versão" onRun={newVersion.bind(null, id)} /> : null}
          </>
        }
      />
      {!draft ? <Alert tone="info" className="mb-6">Este modelo não está em rascunho: itens são imutáveis para preservar o histórico das aplicações.</Alert> : null}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Itens" />
          <CardBody>
            {(items ?? []).length === 0 ? <EmptyState title="Nenhum item">Inclua ao menos um item antes de publicar.</EmptyState> : (
              <ol className="divide-y divide-slate-100">
                {(items ?? []).map((i, n) => (
                  <li key={i.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
                    <div>
                      <p className="font-medium">{n + 1}. {i.label}</p>
                      {i.guidance ? <p className="text-xs text-slate-600">{i.guidance}</p> : null}
                      <span className="mt-1 flex gap-1">{i.required ? <Badge tone="brand">Obrigatório</Badge> : <Badge>Opcional</Badge>}{i.requires_evidence ? <Badge tone="accent">Exige evidência</Badge> : null}</span>
                    </div>
                    {isSup && draft ? <RunButton label="Remover" onRun={removeItem.bind(null, id, i.id)} /> : null}
                  </li>
                ))}
              </ol>
            )}
          </CardBody>
        </Card>
        <div className="space-y-6">
          {isSup && draft ? (
            <Card>
              <CardHeader title="Novo item" />
              <CardBody>
                <ActionForm action={addItem} schema="checklistItem" resetOnSuccess submitLabel="Incluir item">
                  <input type="hidden" name="template_id" value={id} />
                  <input type="hidden" name="program_id" value={t.program_id} />
                  <TextField name="label" label="Item" required />
                  <TextField name="guidance" label="Orientação" />
                  <Checkbox id="it-req" name="required" defaultChecked label="Obrigatório" />
                  <Checkbox id="it-ev" name="requires_evidence" label="Exige evidência quando atendido" />
                </ActionForm>
              </CardBody>
            </Card>
          ) : null}
          <Card>
            <CardHeader title="Versões" />
            <CardBody>
              <ul className="space-y-1 text-sm">
                {(family ?? []).map((f) => (
                  <li key={f.id}>
                    <Link href={`/checklists/modelos/${f.id}`} className={f.id === id ? "font-semibold" : "text-brand-700 hover:underline"}>v{f.version}</Link> — {TEMPLATE_STATUS_LABEL[f.status]}
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
