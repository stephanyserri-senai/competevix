import Link from "next/link";
import { Bell, LogOut } from "lucide-react";
import { Sidebar } from "@/components/layout/sidebar";
import { ROLE_LABEL, requireAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/features/auth/actions";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const access = await requireAccess();
  const supabase = await createClient();
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("resolved_at", null)
    .is("read_at", null);
  const roles = [...new Set(Object.values(access.roles).flat())].map((r) => ROLE_LABEL[r]);
  if (access.isAdmin) roles.unshift("Administração");
  const initials = access.displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex items-center justify-end gap-2 border-b border-slate-200/70 bg-white/80 px-4 py-2.5 backdrop-blur sm:px-8">
          <Link href="/notificacoes" className="relative rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800" aria-label={`Notificações${count ? `: ${count} não lidas` : ""}`}>
            <Bell className="size-5" aria-hidden />
            {count ? <span className="absolute right-0.5 top-0.5 grid min-w-[18px] place-items-center rounded-full bg-accent-600 px-1 text-[10px] font-bold text-white ring-2 ring-white">{count}</span> : null}
          </Link>
          <div className="flex items-center gap-3 rounded-xl py-1 pl-2 pr-1">
            <div className="hidden text-right leading-tight sm:block">
              <p className="text-sm font-semibold text-slate-900">{access.displayName}</p>
              <p className="text-xs text-slate-500">{roles.length ? roles.join(" · ") : "Sem vínculo vigente"}</p>
            </div>
            <span aria-hidden className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-800 text-xs font-bold text-white">{initials || "?"}</span>
          </div>
          <form action={signOut}>
            <button type="submit" className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800" aria-label="Sair">
              <LogOut className="size-5" aria-hidden />
            </button>
          </form>
        </header>
        <main id="conteudo" className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-8 sm:px-8">{children}</main>
      </div>
    </div>
  );
}
