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

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print flex items-center justify-end gap-3 border-b border-slate-200 bg-white px-4 py-2 sm:px-6">
          <Link href="/notificacoes" className="relative rounded-md p-2 text-slate-600 hover:bg-slate-100" aria-label={`Notificações${count ? `: ${count} não lidas` : ""}`}>
            <Bell className="size-5" aria-hidden />
            {count ? (
              <span className="absolute -right-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-accent-600 px-1 text-[10px] font-bold text-white">{count}</span>
            ) : null}
          </Link>
          <div className="text-right leading-tight">
            <p className="text-sm font-semibold text-slate-900">{access.displayName}</p>
            <p className="text-xs text-slate-600">{roles.length ? roles.join(" · ") : "Sem vínculo vigente"}</p>
          </div>
          <form action={signOut}>
            <button type="submit" className="rounded-md p-2 text-slate-600 hover:bg-slate-100" aria-label="Sair">
              <LogOut className="size-5" aria-hidden />
            </button>
          </form>
        </header>
        <main id="conteudo" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
