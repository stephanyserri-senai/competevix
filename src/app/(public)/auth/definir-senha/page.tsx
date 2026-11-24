import { redirect } from "next/navigation";
import { ActionForm } from "@/components/ui/action-form";
import { TextField } from "@/components/ui/field-errors";
import { setPassword } from "@/features/auth/actions";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Definir senha" };

export default async function SetPasswordPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/login?erro=link");
  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-brand-900">Definir senha</h1>
      <p className="text-sm text-slate-600">Mínimo de 10 caracteres, com letras e números.</p>
      <ActionForm action={setPassword} submitLabel="Salvar senha">
        <TextField name="password" type="password" label="Nova senha" autoComplete="new-password" required />
        <TextField name="confirm" type="password" label="Confirmar senha" autoComplete="new-password" required />
      </ActionForm>
    </div>
  );
}
