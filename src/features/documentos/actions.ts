"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { translateDbError } from "@/lib/errors";
import { documentMetaSchema } from "@/features/schemas";
import { ALLOWED_TYPES, signatureMatches, validateFileMeta } from "./domain";

export type LinkTarget =
  | { type: "action"; id: string }
  | { type: "checklist_answer"; id: string }
  | { type: "project"; id: string; kind: string; description: string }
  | null;

type Result<T> = { ok: true; data: T } | { ok: false; message: string };

const fileSchema = z.object({ name: z.string().min(1).max(255), size: z.number().int(), type: z.string() });

/**
 * Passo 1: valida metadados e registra o documento (RLS: só quem gerencia o escopo).
 * O caminho é gerado aqui, com nome aleatório; o upload do arquivo é feito pelo navegador.
 */
export async function prepareUpload(meta: unknown, file: unknown): Promise<Result<{ documentId: string; path: string }>> {
  const m = documentMetaSchema.safeParse(meta);
  const f = fileSchema.safeParse(file);
  if (!m.success || !f.success) return { ok: false, message: "Dados do documento inválidos." };
  const problem = validateFileMeta(f.data);
  if (problem) return { ok: false, message: problem };

  const supabase = await createClient();
  const path = `${m.data.program_id}/${randomUUID()}.${ALLOWED_TYPES[f.data.type].ext}`;
  const { data: claims } = await supabase.auth.getClaims();
  const { data, error } = await supabase
    .from("documents")
    .insert({
      program_id: m.data.program_id,
      team_id: m.data.team_id,
      title: m.data.title,
      classification: m.data.classification,
      supersedes_id: m.data.supersedes_id,
      original_name: f.data.name,
      storage_path: path,
      mime_type: f.data.type,
      size_bytes: f.data.size,
      uploaded_by: claims?.claims?.sub,
    })
    .select("id")
    .single();
  if (error) return { ok: false, message: translateDbError(error) };
  return { ok: true, data: { documentId: data.id, path } };
}

/** Desfaz o registro se o upload falhou (política permite só ao autor, por 15 min). */
export async function cancelUpload(documentId: string): Promise<void> {
  if (!z.uuid().safeParse(documentId).success) return;
  const supabase = await createClient();
  await supabase.from("documents").delete().eq("id", documentId);
}

/**
 * Passo 3: confere o arquivo enviado (existência e assinatura binária) e cria o vínculo
 * com a entidade (ação ou resposta de checklist) por tabela de associação tipada.
 */
export async function finalizeUpload(documentId: string, link: LinkTarget, revalidate: string): Promise<Result<null>> {
  if (!z.uuid().safeParse(documentId).success) return { ok: false, message: "Documento inválido." };
  const supabase = await createClient();
  const { data: doc, error } = await supabase.from("documents").select("id, program_id, storage_path, mime_type").eq("id", documentId).single();
  if (error || !doc) return { ok: false, message: "Documento não encontrado." };

  const { data: blob, error: dlError } = await supabase.storage.from("documentos").download(doc.storage_path);
  if (dlError || !blob) return { ok: false, message: "Arquivo não recebido pelo armazenamento. Tente novamente." };
  const head = new Uint8Array(await blob.slice(0, 4096).arrayBuffer());
  if (!signatureMatches(doc.mime_type, head)) {
    // Conteúdo não corresponde ao tipo: remove o objeto (chave secreta, só servidor) e arquiva o registro
    try {
      await createAdminClient().storage.from("documentos").remove([doc.storage_path]);
    } catch {
      /* sem chave secreta configurada: o registro é arquivado mesmo assim */
    }
    await supabase.from("documents").update({ archived_at: new Date().toISOString() }).eq("id", doc.id);
    return { ok: false, message: "O conteúdo do arquivo não corresponde ao tipo informado e foi descartado." };
  }

  if (link?.type === "action") {
    const { error: e } = await supabase.from("action_evidences").insert({ action_id: link.id, program_id: doc.program_id, document_id: doc.id });
    if (e) return { ok: false, message: translateDbError(e) };
  } else if (link?.type === "project") {
    const kinds = ["comparacao_mercado", "diferencial_tecnico", "validacao_industrial", "teste_produtividade_custo_qualidade", "viabilidade_financeira", "modelo_negocio", "anterioridade", "prototipo_funcional", "outro"] as const;
    const kind = kinds.find((k) => k === link.kind) ?? "outro";
    const { data: claims } = await supabase.auth.getClaims();
    const { error: e } = await supabase.from("project_evidences").insert({
      project_id: link.id, program_id: doc.program_id, document_id: doc.id, kind,
      description: link.description.slice(0, 2000) || "Documento anexado", created_by: claims?.claims?.sub,
    });
    if (e) return { ok: false, message: translateDbError(e) };
  } else if (link?.type === "checklist_answer") {
    const { error: e } = await supabase.from("checklist_answer_evidences").insert({ answer_id: link.id, program_id: doc.program_id, document_id: doc.id });
    if (e) return { ok: false, message: translateDbError(e) };
  }
  revalidatePath(revalidate);
  return { ok: true, data: null };
}

export async function archiveDocument(documentId: string): Promise<Result<null>> {
  const supabase = await createClient();
  const { error } = await supabase.from("documents").update({ archived_at: new Date().toISOString() }).eq("id", documentId).select("id").single();
  if (error) return { ok: false, message: translateDbError(error) };
  revalidatePath("/documentos");
  return { ok: true, data: null };
}
