"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronDown, Menu, X } from "lucide-react";
import { NAV_MAIN, NAV_MORE, NAV_SETTINGS, type NavItem } from "./nav";
import { cn } from "@/lib/cn";

function Brand() {
  // Marca tipográfica do portal — não reproduz logotipos oficiais (PRD §3)
  return (
    <Link href="/dashboard" className="flex items-center gap-3 px-2">
      <span aria-hidden className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-accent-400 to-accent-600 text-sm font-black text-white shadow-lg shadow-accent-600/30">CV</span>
      <span className="leading-tight">
        <span className="block text-[15px] font-extrabold tracking-wide text-white">COMPETE VIX</span>
        <span className="block text-[11px] text-brand-200">Competições · SENAI Vitória</span>
      </span>
    </Link>
  );
}

function Item({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
  const Icon = item.icon;
  return (
    <li>
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all",
          active ? "bg-white/10 font-semibold text-white" : "text-brand-100 hover:bg-white/5 hover:text-white",
        )}
      >
        {active ? <span aria-hidden className="absolute inset-y-2 left-0 w-1 rounded-full bg-accent-500" /> : null}
        <Icon className={cn("size-[18px] shrink-0", active ? "text-accent-400" : "text-brand-300 group-hover:text-brand-100")} aria-hidden />
        <span className="flex-1">{item.label}</span>
      </Link>
    </li>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const inMore = NAV_MORE.some((i) => pathname === i.href || pathname.startsWith(`${i.href}/`));
  const [open, setOpen] = useState(inMore);
  return (
    <nav aria-label="Navegação principal" className="flex flex-1 flex-col gap-6">
      <ul className="space-y-1">{NAV_MAIN.map((i) => <Item key={i.href} item={i} onNavigate={onNavigate} />)}</ul>
      <div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open || inMore}
          className="flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-brand-300 hover:text-white"
        >
          Mais módulos <ChevronDown className={cn("size-4 transition-transform", (open || inMore) && "rotate-180")} aria-hidden />
        </button>
        {open || inMore ? <ul className="mt-1 space-y-0.5">{NAV_MORE.map((i) => <Item key={i.href} item={i} onNavigate={onNavigate} />)}</ul> : null}
      </div>
      <ul className="mt-auto border-t border-white/10 pt-4"><Item item={NAV_SETTINGS} onNavigate={onNavigate} /></ul>
    </nav>
  );
}

export function Sidebar() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <aside className="no-print sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-8 overflow-y-auto bg-gradient-to-b from-brand-900 via-brand-900 to-[#071a36] px-3 py-6 lg:flex">
        <Brand />
        <NavList />
      </aside>
      <div className="no-print flex items-center justify-between bg-brand-900 px-4 py-3 lg:hidden">
        <Brand />
        <button type="button" onClick={() => setOpen(true)} className="rounded-lg p-2 text-white hover:bg-white/10" aria-label="Abrir menu" aria-expanded={open}>
          <Menu className="size-5" />
        </button>
      </div>
      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col gap-6 overflow-y-auto bg-brand-900 px-3 py-5">
            <div className="flex items-center justify-between">
              <Brand />
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 text-white hover:bg-white/10" aria-label="Fechar menu"><X className="size-5" /></button>
            </div>
            <NavList onNavigate={() => setOpen(false)} />
          </div>
        </div>
      ) : null}
    </>
  );
}
