/** Regras puras de arquivos: tipos permitidos, tamanho e assinatura binária (PRD §10). */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export const ALLOWED_TYPES: Record<string, { ext: string; label: string }> = {
  "application/pdf": { ext: "pdf", label: "PDF" },
  "image/png": { ext: "png", label: "PNG" },
  "image/jpeg": { ext: "jpg", label: "JPEG" },
  "image/webp": { ext: "webp", label: "WebP" },
  "text/plain": { ext: "txt", label: "Texto" },
  "text/csv": { ext: "csv", label: "CSV" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { ext: "docx", label: "Word" },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { ext: "xlsx", label: "Excel" },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": { ext: "pptx", label: "PowerPoint" },
};

export const ACCEPT_ATTR = Object.keys(ALLOWED_TYPES).join(",");

export function validateFileMeta(f: { size: number; type: string; name: string }): string | null {
  if (!f.size) return "Arquivo vazio.";
  if (f.size > MAX_UPLOAD_BYTES) return "Arquivo acima de 20 MB.";
  if (!ALLOWED_TYPES[f.type]) return "Tipo de arquivo não permitido (PDF, imagens, texto/CSV ou Office).";
  if (f.name.length > 255) return "Nome de arquivo muito longo.";
  return null;
}

/** Confere se os primeiros bytes correspondem ao tipo declarado (evita arquivo disfarçado). */
export function signatureMatches(mime: string, head: Uint8Array): boolean {
  const starts = (...bytes: number[]) => bytes.every((b, i) => head[i] === b);
  switch (mime) {
    case "application/pdf":
      return starts(0x25, 0x50, 0x44, 0x46); // %PDF
    case "image/png":
      return starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case "image/jpeg":
      return starts(0xff, 0xd8, 0xff);
    case "image/webp":
      return starts(0x52, 0x49, 0x46, 0x46) && head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50;
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      return starts(0x50, 0x4b, 0x03, 0x04); // ZIP (OOXML)
    case "text/plain":
    case "text/csv":
      return !head.slice(0, 4096).includes(0); // texto não contém byte nulo
    default:
      return false;
  }
}
