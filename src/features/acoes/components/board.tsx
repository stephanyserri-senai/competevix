"use client";

import { STAGE_COLOR } from "@/features/bi/colors";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { AlertTriangle, ArrowRight, CalendarClock, Check, CornerUpLeft, Lock, LockOpen, Play, Send } from "lucide-react";
import { BOARD_STAGES, STAGE_LABEL, THEME_LABEL, needsNote, nextStages, type Stage, type Theme } from "@/features/bi/domain";
import { moveAction, setBlocked } from "../actions";
import { cn } from "@/lib/cn";

export type BoardCard = {
  id: string;
  title: string;
  stage: Stage;
  programLabel: string;
  programId: string;
  teamName: string | null;
  ownerName: string | null;
  dueLabel: string | null;
  overdue: boolean;
  blocked: boolean;
  blockedReason: string | null;
  theme: Theme | null;
  canMove: boolean;
  isSupervisor: boolean;
};

const COLUMN_STYLE: Record<Stage, { ring: string }> = {
  a_fazer: { ring: "ring-amber-300" },
  em_andamento: { ring: "ring-brand-300" },
  em_validacao: { ring: "ring-orange-300" },
  concluida: { ring: "ring-emerald-300" },
  cancelada: { ring: "ring-slate-200" },
};
const ACTION_LABEL: Partial<Record<Stage, { label: string; icon: typeof Play }>> = {
  em_andamento: { label: "Iniciar", icon: Play },
  em_validacao: { label: "Enviar p/ validação", icon: Send },
  concluida: { label: "Aprovar", icon: Check },
  a_fazer: { label: "Voltar p/ a fazer", icon: CornerUpLeft },
};

export type Prompt = { card: BoardCard; to: Stage | "bloquear"; title: string; label: string; required: boolean } | null;

export function ActionBoard({ cards: initial }: { cards: BoardCard[] }) {
  const router = useRouter();
  const [cards, setCards] = useState(initial);
  const [pending, start] = useTransition();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<Stage | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [prompt, setPrompt] = useState<Prompt>(null);
  // Atualiza o quadro quando o servidor envia dados novos (sem efeito: ajuste durante o render)
  const [source, setSource] = useState(initial);
  if (source !== initial) {
    setSource(initial);
    setCards(initial);
  }

  function run(card: BoardCard, to: Stage, note?: string) {
    const prev = cards;
    setCards((cs) => cs.map((c) => (c.id === card.id ? { ...c, stage: to, blocked: to === "em_validacao" || to === "concluida" ? false : c.blocked } : c)));
    start(async () => {
      const r = await moveAction(card.id, to, note);
      if (!r?.ok) { setCards(prev); setMsg({ ok: false, text: r?.message ?? "Não foi possível mover." }); }
      else { setMsg({ ok: true, text: `“${card.title}” → ${STAGE_LABEL[to]}` }); router.refresh(); }
    });
  }

  function request(card: BoardCard, to: Stage) {
    if (!nextStages(card.stage, card.isSupervisor).includes(to)) {
      setMsg({ ok: false, text: card.stage === "em_validacao" ? "Em validação: só a supervisão aprova ou devolve." : `Movimento não permitido: ${STAGE_LABEL[card.stage]} → ${STAGE_LABEL[to]}.` });
      return;
    }
    if (needsNote(card.stage, to)) {
      setPrompt({ card, to, title: card.stage === "em_validacao" ? "Devolver para ajustes" : "Reabrir ação", label: card.stage === "em_validacao" ? "O que precisa ser ajustado?" : "Por que reabrir?", required: true });
      return;
    }
    if (to === "em_validacao") {
      setPrompt({ card, to, title: "Enviar para validação", label: "O que foi feito? (opcional)", required: false });
      return;
    }
    run(card, to);
  }

  function toggleBlock(card: BoardCard) {
    if (card.blocked) {
      start(async () => {
        const r = await setBlocked(card.id, false);
        setMsg({ ok: Boolean(r?.ok), text: r?.message ?? "" });
        if (r?.ok) router.refresh();
      });
    } else setPrompt({ card, to: "bloquear", title: "Sinalizar bloqueio", label: "O que está impedindo?", required: true });
  }

  return (
    <div aria-busy={pending}>
      {msg ? (
        <div role={msg.ok ? "status" : "alert"} className={cn("mb-3 rounded-xl px-4 py-2 text-sm", msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800")}>
          {msg.text}
        </div>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {BOARD_STAGES.map((col) => {
          const items = cards.filter((c) => c.stage === col);
          return (
            <section
              key={col}
              aria-label={`${STAGE_LABEL[col]}: ${items.length}`}
              onDragOver={(e) => { if (dragId) { e.preventDefault(); setOverCol(col); } }}
              onDragLeave={() => setOverCol((c) => (c === col ? null : c))}
              onDrop={(e) => {
                e.preventDefault();
                setOverCol(null);
                const card = cards.find((c) => c.id === dragId);
                setDragId(null);
                if (card && card.stage !== col) request(card, col);
              }}
              className={cn("flex min-h-48 flex-col rounded-2xl bg-slate-100/70 p-3 transition", overCol === col && "bg-brand-50 ring-2 ring-inset", overCol === col && COLUMN_STYLE[col].ring)}
            >
              <h2 className="mb-3 flex items-center gap-2 px-1 text-sm font-semibold text-slate-700">
                <span className="size-2.5 rounded-full" style={{ backgroundColor: STAGE_COLOR[col] }} aria-hidden />
                {STAGE_LABEL[col]}
                <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-600 shadow-sm">{items.length}</span>
              </h2>
              <ul className="flex flex-1 flex-col gap-2.5">
                {items.length === 0 ? <li className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-xs text-slate-400">Arraste ações para cá</li> : null}
                {items.map((c) => {
                  const moves = c.canMove ? nextStages(c.stage, c.isSupervisor) : [];
                  const forward = moves.filter((m) => m !== "a_fazer" && !(c.stage === "em_validacao" && m === "em_andamento") && !(c.stage === "concluida"));
                  return (
                    <li
                      key={c.id}
                      draggable={c.canMove}
                      onDragStart={() => setDragId(c.id)}
                      onDragEnd={() => { setDragId(null); setOverCol(null); }}
                      className={cn(
                        "group rounded-xl border bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
                        c.blocked ? "border-amber-300" : c.overdue ? "border-red-200" : "border-slate-200",
                        c.canMove && "cursor-grab active:cursor-grabbing",
                        dragId === c.id && "opacity-50",
                      )}
                    >
                      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                        <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[11px] font-medium text-brand-800">{c.programLabel}</span>
                        {c.theme ? <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{THEME_LABEL[c.theme]}</span> : null}
                        {c.blocked ? <span title={c.blockedReason ?? undefined} className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800"><AlertTriangle className="size-3" aria-hidden /> Bloqueada</span> : null}
                      </div>
                      <Link href={`/acoes/${c.id}`} className="block text-sm font-semibold leading-snug text-slate-900 hover:text-brand-700">{c.title}</Link>
                      {c.blocked && c.blockedReason ? <p className="mt-1 text-xs text-amber-800">{c.blockedReason}</p> : null}
                      <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-700" aria-hidden>
                          {c.ownerName ? c.ownerName.replace(/^\[DEMO\]\s*/, "").split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase() : "?"}
                        </span>
                        <span className="truncate">{c.ownerName ?? "Sem responsável"}{c.teamName ? ` · ${c.teamName}` : ""}</span>
                      </div>
                      {c.dueLabel ? (
                        <p className={cn("mt-1.5 inline-flex items-center gap-1 text-xs", c.overdue ? "font-semibold text-red-700" : "text-slate-500")}>
                          <CalendarClock className="size-3.5" aria-hidden /> {c.dueLabel}
                        </p>
                      ) : null}
                      {c.canMove ? (
                        <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-slate-100 pt-2.5">
                          {forward.slice(0, 2).map((m) => {
                            const a = ACTION_LABEL[m] ?? { label: STAGE_LABEL[m], icon: ArrowRight };
                            const Icon = a.icon;
                            return (
                              <button key={m} type="button" disabled={pending} onClick={() => request(c, m)}
                                className={cn("inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition",
                                  m === "concluida" ? "bg-emerald-600 text-white hover:bg-emerald-700" : m === "em_validacao" ? "bg-accent-600 text-white hover:bg-accent-700" : "bg-brand-50 text-brand-800 hover:bg-brand-100")}>
                                <Icon className="size-3.5" aria-hidden /> {a.label}
                              </button>
                            );
                          })}
                          {c.stage === "em_validacao" && c.isSupervisor ? (
                            <button type="button" disabled={pending} onClick={() => request(c, "em_andamento")} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200">
                              <CornerUpLeft className="size-3.5" aria-hidden /> Devolver
                            </button>
                          ) : null}
                          {(c.stage === "a_fazer" || c.stage === "em_andamento") ? (
                            <button type="button" disabled={pending} onClick={() => toggleBlock(c)} className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100" aria-label={c.blocked ? "Desbloquear" : "Sinalizar bloqueio"} title={c.blocked ? "Desbloquear" : "Sinalizar bloqueio"}>
                              {c.blocked ? <LockOpen className="size-3.5" aria-hidden /> : <Lock className="size-3.5" aria-hidden />}
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
      {prompt ? <NotePrompt prompt={prompt} onClose={() => setPrompt(null)} onConfirm={(note) => {
        const p = prompt;
        setPrompt(null);
        if (p.to === "bloquear") {
          start(async () => {
            const r = await setBlocked(p.card.id, true, note);
            setMsg({ ok: Boolean(r?.ok), text: r?.message ?? "" });
            if (r?.ok) router.refresh();
          });
        } else run(p.card, p.to, note);
      }} /> : null}
    </div>
  );
}

export function NotePrompt({ prompt, onClose, onConfirm }: { prompt: NonNullable<Prompt>; onClose: () => void; onConfirm: (note: string) => void }) {
  const [note, setNote] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-labelledby="prompt-title">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <form className="relative w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" onSubmit={(e) => { e.preventDefault(); if (prompt.required && !note.trim()) return; onConfirm(note.trim()); }}
        onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
        <h2 id="prompt-title" className="text-lg font-semibold text-slate-900">{prompt.title}</h2>
        <p className="mb-3 text-sm text-slate-500">{prompt.card.title}</p>
        <label className="block text-sm font-medium text-slate-700" htmlFor="prompt-note">{prompt.label}{prompt.required ? " *" : ""}</label>
        <textarea id="prompt-note" ref={ref} value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000}
          className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm" />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">Cancelar</button>
          <button type="submit" disabled={prompt.required && !note.trim()} className="rounded-xl bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50">Confirmar</button>
        </div>
      </form>
    </div>
  );
}
