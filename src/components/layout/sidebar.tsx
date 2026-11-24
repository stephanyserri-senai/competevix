"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { NAV } from "./nav";
import { cn } from "@/lib/cn";

function Brand() {
  // Marca tipográfica do portal — não reproduz logotipos oficiais (PRD §3)
  return (
    <Link href="/dashboard" className="flex items-center gap-2 px-2">
      <span aria-hidden className="grid size-9 place-items-center rounded-md bg-accent-500 text-sm font-black text-white">CV</span>
      <span className="leading-tight">
        <span className="block text-base font-extrabold tracking-wide text-white">COMPETE VIX</span>
        <span className="block text-[11px] text-brand-200">Gestão integrada de competições</span>
      </span>
    </Link>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Navegação principal" className="space-y-5">
      {NAV.map((group) => (
        <div key={group.section}>
          <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-brand-300">{group.section}</p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                      active ? "bg-brand-700 font-semibold text-white" : "text-brand-100 hover:bg-brand-800 hover:text-white",
                    )}
                  >
                    <Icon className={cn("size-4 shrink-0", active ? "text-accent-400" : "")} aria-hidden />
                    <span className="flex-1">{item.label}</span>
                    {item.stage > 1 ? (
                      <span className="rounded bg-brand-800 px-1.5 text-[10px] font-medium text-brand-200" title={`Prevista na etapa ${item.stage}`}>
                        E{item.stage}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function Sidebar() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <aside className="no-print hidden w-64 shrink-0 flex-col gap-6 bg-brand-900 px-3 py-5 lg:flex">
        <Brand />
        <NavList />
      </aside>
      <div className="no-print flex items-center justify-between bg-brand-900 px-4 py-3 lg:hidden">
        <Brand />
        <button type="button" onClick={() => setOpen(true)} className="rounded-md p-2 text-white hover:bg-brand-800" aria-label="Abrir menu" aria-expanded={open}>
          <Menu className="size-5" />
        </button>
      </div>
      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col gap-6 overflow-y-auto bg-brand-900 px-3 py-5">
            <div className="flex items-center justify-between">
              <Brand />
              <button type="button" onClick={() => setOpen(false)} className="rounded-md p-2 text-white hover:bg-brand-800" aria-label="Fechar menu">
                <X className="size-5" />
              </button>
            </div>
            <NavList onNavigate={() => setOpen(false)} />
          </div>
        </div>
      ) : null}
    </>
  );
}
