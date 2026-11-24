export const metadata = { title: "Configuração pendente" };

export default function ConfigPending() {
  return (
    <div className="space-y-3 text-sm text-slate-700">
      <h1 className="text-xl font-bold text-brand-900">Configuração pendente</h1>
      <p>
        As variáveis de conexão com o Supabase não estão definidas neste ambiente. Copie <code>.env.example</code> para
        <code> .env.local</code> e preencha <code>NEXT_PUBLIC_SUPABASE_URL</code> e <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code>.
      </p>
      <p>Consulte o README (seção “Configuração local”).</p>
    </div>
  );
}
