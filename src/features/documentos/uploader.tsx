"use client";

import { useId, useRef, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { Alert } from "@/components/ui/feedback";
import { buttonClass } from "@/components/ui/button";
import { ACCEPT_ATTR, validateFileMeta } from "./domain";
import { cancelUpload, finalizeUpload, prepareUpload, type LinkTarget } from "./actions";
import { CLASSIFICATION_LABEL } from "@/features/labels";

/**
 * Upload em 3 passos: (1) servidor registra o documento e gera caminho aleatório;
 * (2) navegador envia o arquivo direto ao Storage privado (política exige o registro);
 * (3) servidor confere a assinatura binária e cria o vínculo de evidência.
 */
export function DocumentUploader({
  programId,
  teamId,
  link = null,
  revalidate,
  compact = false,
  supersedesId,
  defaultTitle,
}: {
  programId: string;
  teamId?: string | null;
  link?: LinkTarget;
  revalidate: string;
  compact?: boolean;
  supersedesId?: string;
  defaultTitle?: string;
}) {
  const uid = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [status, setStatus] = useState<{ tone: "info" | "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const file = fd.get("file");
    if (!(file instanceof File) || !file.size) return setStatus({ tone: "error", text: "Selecione um arquivo." });
    const problem = validateFileMeta(file);
    if (problem) return setStatus({ tone: "error", text: problem });
    const title = String(fd.get("title") ?? "").trim() || file.name;

    setBusy(true);
    setStatus({ tone: "info", text: "Registrando documento…" });
    const prep = await prepareUpload(
      { program_id: programId, team_id: teamId ?? null, title, classification: fd.get("classification") ?? "interno", supersedes_id: supersedesId ?? null },
      { name: file.name, size: file.size, type: file.type },
    );
    if (!prep.ok) {
      setBusy(false);
      return setStatus({ tone: "error", text: prep.message });
    }
    setStatus({ tone: "info", text: "Enviando arquivo…" });
    const supabase = createBrowserSupabase();
    const { error } = await supabase.storage.from("documentos").upload(prep.data.path, file, { contentType: file.type, upsert: false });
    if (error) {
      await cancelUpload(prep.data.documentId);
      setBusy(false);
      return setStatus({ tone: "error", text: "Falha no envio do arquivo. Nada foi registrado." });
    }
    setStatus({ tone: "info", text: "Verificando arquivo…" });
    const fin = await finalizeUpload(prep.data.documentId, link, revalidate);
    setBusy(false);
    if (!fin.ok) return setStatus({ tone: "error", text: fin.message });
    formRef.current?.reset();
    setStatus({ tone: "success", text: "Documento enviado." });
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-3" aria-busy={busy}>
      <div className={compact ? "grid gap-2 sm:grid-cols-2" : "space-y-3"}>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-800">Arquivo <span className="text-red-700">*</span></span>
          <input id={`${uid}-file`} name="file" type="file" accept={ACCEPT_ATTR} required className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-brand-800" />
          <span className="mt-1 block text-xs text-slate-600">PDF, imagens, texto/CSV ou Office, até 20 MB.</span>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-800">Título</span>
          <input name="title" defaultValue={defaultTitle} maxLength={200} placeholder="Usa o nome do arquivo se vazio" className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-800">Classificação</span>
          <select name="classification" defaultValue="interno" className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
            {Object.entries(CLASSIFICATION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <span className="mt-1 block text-xs text-slate-600">Confidencial: só supervisão e quem enviou.</span>
        </label>
      </div>
      {status ? <Alert tone={status.tone}>{status.text}</Alert> : null}
      <button type="submit" disabled={busy} className={buttonClass("secondary", "sm")}>{busy ? "Enviando…" : "Enviar documento"}</button>
    </form>
  );
}
