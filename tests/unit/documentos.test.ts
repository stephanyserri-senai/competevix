import { describe, expect, it } from "vitest";
import { signatureMatches, validateFileMeta } from "@/features/documentos/domain";

describe("validação de arquivos", () => {
  it("tamanho e tipo", () => {
    expect(validateFileMeta({ size: 0, type: "application/pdf", name: "a.pdf" })).toMatch(/vazio/);
    expect(validateFileMeta({ size: 21 * 1024 * 1024, type: "application/pdf", name: "a.pdf" })).toMatch(/20 MB/);
    expect(validateFileMeta({ size: 10, type: "application/x-msdownload", name: "a.exe" })).toMatch(/não permitido/);
    expect(validateFileMeta({ size: 10, type: "image/png", name: "a.png" })).toBeNull();
  });
  it("assinatura binária", () => {
    expect(signatureMatches("application/pdf", new TextEncoder().encode("%PDF-1.7"))).toBe(true);
    expect(signatureMatches("application/pdf", new TextEncoder().encode("MZ\x90\x00"))).toBe(false);
    expect(signatureMatches("image/png", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
    expect(signatureMatches("text/csv", new Uint8Array([0x61, 0x00, 0x62]))).toBe(false);
    expect(signatureMatches("text/csv", new TextEncoder().encode("a;b\n1;2"))).toBe(true);
  });
});
