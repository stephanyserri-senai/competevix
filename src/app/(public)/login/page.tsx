import Link from "next/link";
import type { Metadata } from "next";
import { ActionForm } from "@/components/ui/action-form";
import { TextField } from "@/components/ui/field-errors";
import { Alert } from "@/components/ui/feedback";
import { signIn } from "@/features/auth/actions";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : "";
  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-brand-900">Entrar</h1>
      {sp.motivo === "sessao" ? <Alert tone="info">Sua sessão terminou ou o acesso foi revogado. Entre novamente.</Alert> : null}
      {sp.erro === "link" ? <Alert tone="error">Link inválido ou expirado. Solicite um novo convite ou redefinição.</Alert> : null}
      <ActionForm action={signIn} submitLabel="Entrar">
        <input type="hidden" name="next" value={next} />
        <TextField name="email" type="email" label="E-mail institucional" autoComplete="email" required />
        <TextField name="password" type="password" label="Senha" autoComplete="current-password" required />
      </ActionForm>
      <p className="text-sm">
        <Link href="/auth/recuperar" className="font-medium text-brand-700 underline-offset-2 hover:underline">Esqueci minha senha</Link>
      </p>
      <p className="text-xs text-slate-600">Não há cadastro público: o acesso é concedido por convite da administração.</p>
    </div>
  );
}
