"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Ban, Check, CornerUpLeft, Lock, LockOpen, Play, RotateCcw, Send } from "lucide-react";
import { STAGE_LABEL, needsNote, nextStages, type Stage } from "@/features/bi/domain";
import { moveAction, setBlocked } from "../actions";
import { NotePrompt, type BoardCard } from "./board";
import { cn } from "@/lib/cn";

const META: Record<string, { label: string; icon: typeof Play; tone: string }> = {
  em_andamento: { label: "Iniciar", icon: Play, tone: "bg-brand-700 text-white hover:bg-brand-800" },
  em_validacao: { label: "Enviar para validação", icon: Send, tone: "bg-accent-600 text-white hover:bg-accent-700" },
  concluida: { label: "Aprovar e concluir", icon: Check, tone: "bg-emerald-600 text-white hover:bg-emerald-700" },
  a_fazer: { label: "Voltar para a fazer", icon: CornerUpLeft, tone: "bg-slate-100 text-slate-700 hover:bg-slate-200" },
  devolver: { label: "Devolver para ajustes", icon: CornerUpLeft, tone: "bg-slate-100 text-slate-700 hover:bg-slate-200" },
  reabrir: { label: "Reabrir", icon: RotateCcw, tone: "bg-slate-100 text-slate-700 hover:bg-slate-200" },
};

/** Botões do próximo passo do workflow (mesmas regras do banco). */
export function ActionControls({ id, title, stage, blocked, isSupervisor, canMove }: { id: string; title: string; stage: Stage; blocked: boolean; isSupervisor: boolean; canMove: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [prompt, setPrompt] = useState<{ to: Stage | "bloquear" | "cancelar"; title: string; label: string; required: boolean } | null>(null);
  if (!canMove) return null;
  const moves = nextStages(stage, isSupervisor);
  const card = { id, title } as BoardCard;

  const exec = (fn: () => Promise<{ ok: boolean; message?: string } | null>) =>
    start(async () => {
      const r = await fn();
      setMsg({ ok: Boolean(r?.ok), text: r?.message ?? "" });
      if (r?.ok) router.refresh();
    });

  const go = (to: Stage) => {
    if (needsNote(stage, to)) return setPrompt({ to, title: stage === "em_validacao" ? "Devolver para ajustes" : "Reabrir ação", label: stage === "em_validacao" ? "O que precisa ser ajustado?" : "Por que reabrir?", required: true });
    if (to === "em_validacao") return setPrompt({ to, title: "Enviar para validação", label: "O que foi feito? (opcional)", required: false });
    exec(() => moveAction(id, to));
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {moves.map((m) => {
          const key = stage === "em_validacao" && m === "em_andamento" ? "devolver" : (stage === "concluida" || stage === "cancelada") ? "reabrir" : m;
          const meta = META[key] ?? { label: STAGE_LABEL[m], icon: Play, tone: "bg-slate-100 text-slate-700" };
          const Icon = meta.icon;
          return (
            <button key={m} type="button" disabled={pending} onClick={() => go(m)} className={cn("inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium shadow-sm transition", meta.tone)}>
              <Icon className="size-4" aria-hidden /> {meta.label}
            </button>
          );
        })}
        {(stage === "a_fazer" || stage === "em_andamento") ? (
          <button type="button" disabled={pending}
            onClick={() => (blocked ? exec(() => setBlocked(id, false)) : setPrompt({ to: "bloquear", title: "Sinalizar bloqueio", label: "O que está impedindo?", required: true }))}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-700 shadow-sm hover:bg-slate-50">
            {blocked ? <LockOpen className="size-4" aria-hidden /> : <Lock className="size-4" aria-hidden />} {blocked ? "Desbloquear" : "Sinalizar bloqueio"}
          </button>
        ) : null}
        {stage !== "concluida" && stage !== "cancelada" ? (
          <button type="button" disabled={pending} onClick={() => setPrompt({ to: "cancelar", title: "Cancelar ação", label: "Motivo do cancelamento", required: true })}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-slate-500 hover:bg-slate-100">
            <Ban className="size-4" aria-hidden /> Cancelar
          </button>
        ) : null}
      </div>
      {stage === "em_validacao" && !isSupervisor ? <p className="text-sm text-slate-500">Aguardando a supervisão aprovar ou devolver.</p> : null}
      {msg?.text ? <p role={msg.ok ? "status" : "alert"} className={cn("rounded-xl px-3 py-2 text-sm", msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800")}>{msg.text}</p> : null}
      {prompt ? (
        <NotePrompt
          prompt={{ card, to: prompt.to === "cancelar" ? "cancelada" : (prompt.to as Stage), title: prompt.title, label: prompt.label, required: prompt.required }}
          onClose={() => setPrompt(null)}
          onConfirm={(note) => {
            const p = prompt;
            setPrompt(null);
            if (p.to === "bloquear") exec(() => setBlocked(id, true, note));
            else if (p.to === "cancelar") exec(() => moveAction(id, "cancelada", note));
            else exec(() => moveAction(id, p.to as Stage, note));
          }}
        />
      ) : null}
    </div>
  );
}
