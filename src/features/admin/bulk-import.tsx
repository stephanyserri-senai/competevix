"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Download, FileUp } from "lucide-react";
import { Alert } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { importUsers, type ImportState } from "./import-actions";
import { CSV_TEMPLATE, toCsv } from "./import-domain";

function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function Buttons() {
  const { pending } = useFormStatus();
  return (
    <div className="flex flex-wrap gap-2">
      <button type="submit" name="mode" value="validar" disabled={pending} className={buttonClass("secondary")}>
        {pending ? "Processando…" : "1. Validar"}
      </button>
      <button type="submit" name="mode" value="importar" disabled={pending} className={buttonClass("accent")}
        onClick={(e) => { if (!window.confirm("Importar agora? Usuários e vínculos serão criados.")) e.preventDefault(); }}>
        2. Importar
      </button>
    </div>
  );
}

export function BulkImport() {
  const [state, action] = useActionState<ImportState, FormData>(importUsers, null);
  const [csv, setCsv] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const links = state?.results?.filter((r) => r.link) ?? [];

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={buttonClass("secondary", "sm")} onClick={() => download("modelo-usuarios.csv", "﻿" + CSV_TEMPLATE)}>
            <Download className="size-4" aria-hidden /> Baixar modelo CSV
          </button>
          <button type="button" className={buttonClass("secondary", "sm")} onClick={() => fileRef.current?.click()}>
            <FileUp className="size-4" aria-hidden /> Abrir arquivo .csv
          </button>
          <input
            ref={fileRef} type="file" accept=".csv,text/csv,text/plain" className="sr-only" aria-label="Arquivo CSV"
            onChange={async (e) => { const f = e.target.files?.[0]; if (f) setCsv(await f.text()); }}
          />
          <span className="text-xs text-slate-600">No Excel: Salvar como → “CSV UTF-8 (separado por vírgulas)”.</span>
        </div>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-800">Conteúdo do CSV</span>
          <textarea
            name="csv" value={csv} onChange={(e) => setCsv(e.target.value)} rows={10} spellCheck={false}
            placeholder={CSV_TEMPLATE}
            className="block w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs"
          />
        </label>
        <fieldset className="space-y-1 text-sm">
          <legend className="mb-1 font-medium text-slate-800">Primeiro acesso dos novos usuários</legend>
          <label className="flex items-start gap-2">
            <input type="radio" name="metodo" value="link" defaultChecked className="mt-1 size-4" />
            <span><strong>Gerar links</strong> para eu distribuir (recomendado: não depende do limite de e-mails do Supabase)</span>
          </label>
          <label className="flex items-start gap-2">
            <input type="radio" name="metodo" value="email" className="mt-1 size-4" />
            <span><strong>Enviar convite por e-mail</strong> (exige SMTP configurado no Supabase)</span>
          </label>
        </fieldset>
        <Buttons />
      </form>

      {state ? <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert> : null}

      {state?.issues.length ? (
        <div className="overflow-x-auto rounded-md border border-red-200">
          <table className="min-w-full text-sm">
            <caption className="sr-only">Problemas encontrados</caption>
            <thead className="bg-red-50 text-left"><tr><th className="px-3 py-1.5">Linha</th><th className="px-3 py-1.5">E-mail</th><th className="px-3 py-1.5">Problema</th></tr></thead>
            <tbody>{state.issues.map((i, k) => <tr key={k} className="border-t border-red-100"><td className="px-3 py-1.5">{i.line || "—"}</td><td className="px-3 py-1.5">{i.email}</td><td className="px-3 py-1.5">{i.message}</td></tr>)}</tbody>
          </table>
        </div>
      ) : null}

      {state?.mode === "validar" && state.preview?.length && !state.issues.length ? (
        <div className="overflow-x-auto rounded-md border border-slate-200">
          <table className="min-w-full text-sm">
            <caption className="sr-only">Pré-visualização</caption>
            <thead className="bg-slate-50 text-left"><tr><th className="px-3 py-1.5">Linha</th><th className="px-3 py-1.5">E-mail</th><th className="px-3 py-1.5">Nome</th><th className="px-3 py-1.5">Papel</th><th className="px-3 py-1.5">Escopo</th><th className="px-3 py-1.5">Vigência</th></tr></thead>
            <tbody>{state.preview.map((p) => <tr key={p.line} className="border-t border-slate-100"><td className="px-3 py-1.5">{p.line}</td><td className="px-3 py-1.5">{p.email}</td><td className="px-3 py-1.5">{p.name}</td><td className="px-3 py-1.5">{p.role}</td><td className="px-3 py-1.5">{p.scope}</td><td className="px-3 py-1.5">{p.validFrom}{p.validTo ? ` → ${p.validTo}` : ""}</td></tr>)}</tbody>
          </table>
        </div>
      ) : null}

      {state?.results?.length ? (
        <div className="space-y-3">
          {links.length ? (
            <Alert tone="warning" title={`${links.length} link(s) de primeiro acesso gerado(s)`}>
              Baixe agora: os links não são exibidos de novo. Cada link é pessoal, vale por tempo limitado (configuração de expiração do Supabase) e só pode ser usado uma vez. Envie por canal institucional.
              <div className="mt-2">
                <button type="button" className={buttonClass("primary", "sm")}
                  onClick={() => download("links-primeiro-acesso.csv", toCsv([["email", "link"], ...links.map((l) => [l.email, l.link!])]))}>
                  <Download className="size-4" aria-hidden /> Baixar links (CSV)
                </button>
              </div>
            </Alert>
          ) : null}
          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="min-w-full text-sm">
              <caption className="sr-only">Resultado da importação</caption>
              <thead className="bg-slate-50 text-left"><tr><th className="px-3 py-1.5">Linha</th><th className="px-3 py-1.5">E-mail</th><th className="px-3 py-1.5">Situação</th><th className="px-3 py-1.5">Detalhe</th></tr></thead>
              <tbody>{state.results.map((r, k) => (
                <tr key={k} className="border-t border-slate-100">
                  <td className="px-3 py-1.5">{r.line}</td><td className="px-3 py-1.5">{r.email}</td>
                  <td className="px-3 py-1.5"><Badge tone={r.status === "ok" ? "success" : r.status === "aviso" ? "warning" : "danger"}>{r.status === "ok" ? "OK" : r.status === "aviso" ? "Aviso" : "Erro"}</Badge></td>
                  <td className="px-3 py-1.5">{r.message}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
