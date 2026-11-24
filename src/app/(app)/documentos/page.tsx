import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { ProgramPicker } from "@/components/layout/program-picker";
import { hasRole, requireAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/dates";
import { listPrograms, pickProgram, programLabel } from "@/features/programas/queries";
import { DocumentUploader } from "@/features/documentos/uploader";
import { ArchiveDocButton } from "@/features/documentos/archive-doc-button";
import { CLASSIFICATION_LABEL } from "@/features/labels";
import { ALLOWED_TYPES } from "@/features/documentos/domain";

export const metadata: Metadata = { title: "Documentos" };

const formatSize = (b: number) => (b < 1024 * 1024 ? `${Math.ceil(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB`);

export default async function DocumentosPage({ searchParams }: PageProps<"/documentos">) {
  const sp = await searchParams;
  const access = await requireAccess();
  const supabase = await createClient();
  const programs = await listPrograms(supabase);
  const program = pickProgram(programs, sp.programa) ?? programs[0] ?? null;

  const header = (
    <PageHeader
      eyebrow="RF13 (núcleo)"
      title="Documentos"
      description="Armazenamento privado com classificação, versão e download por link temporário. Vínculos com ações e checklists aparecem como evidências."
    />
  );
  if (!program) return <>{header}<EmptyState title="Nenhum programa no seu escopo" /></>;

  const { data: docs } = await supabase
    .from("documents")
    .select("id, title, original_name, mime_type, size_bytes, classification, version, created_at, archived_at, uploaded_by, team:teams(name), uploader:profiles!documents_uploaded_by_fkey(display_name)")
    .eq("program_id", program.id)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(200);
  const canUpload = hasRole(access, program.id, "supervisao", "orientador");
  const isSup = hasRole(access, program.id, "supervisao");

  return (
    <>
      {header}
      <div className="mb-6">
        <ProgramPicker programs={programs.map((p) => ({ id: p.id, label: programLabel(p) }))} value={program.id} />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {(docs ?? []).length === 0 ? (
            <EmptyState title="Nenhum documento visível neste programa" />
          ) : (
            <Table caption="Documentos do programa">
              <thead><tr><Th>Documento</Th><Th>Classificação</Th><Th>Enviado</Th><Th><span className="sr-only">Ações</span></Th></tr></thead>
              <tbody>
                {(docs ?? []).map((d) => (
                  <Tr key={d.id}>
                    <Td>
                      <a href={`/documentos/${d.id}/download`} className="font-medium text-brand-700 hover:underline">{d.title}</a>
                      <p className="text-xs text-slate-600">
                        {ALLOWED_TYPES[d.mime_type]?.label ?? d.mime_type} · {formatSize(d.size_bytes)} · v{d.version}{d.team ? ` · ${d.team.name}` : ""}
                      </p>
                    </Td>
                    <Td><Badge tone={d.classification === "confidencial" ? "danger" : d.classification === "restrito" ? "warning" : "neutral"}>{CLASSIFICATION_LABEL[d.classification]}</Badge></Td>
                    <Td className="text-xs">{formatDateTime(d.created_at)}<br />{d.uploader?.display_name ?? "—"}</Td>
                    <Td>{isSup || d.uploaded_by === access.userId ? <ArchiveDocButton id={d.id} /> : null}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
        {canUpload ? (
          <Card>
            <CardHeader title="Enviar documento" description={hasRole(access, program.id, "supervisao") ? "Documento geral do programa." : "Orientadores enviam documentos pelas ações e checklists das suas equipes."} />
            <CardBody>
              {isSup ? <DocumentUploader programId={program.id} revalidate="/documentos" /> : <p className="text-sm text-slate-600">Use a página da ação ou do checklist da equipe para anexar evidências.</p>}
            </CardBody>
          </Card>
        ) : null}
      </div>
    </>
  );
}
