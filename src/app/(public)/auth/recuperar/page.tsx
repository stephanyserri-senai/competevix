import Link from "next/link";
import { ActionForm } from "@/components/ui/action-form";
import { TextField } from "@/components/ui/field-errors";
import { requestPasswordReset } from "@/features/auth/actions";

export const metadata = { title: "Recuperar senha" };

export default function RecoverPage() {
  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-brand-900">Recuperar senha</h1>
      <ActionForm action={requestPasswordReset} submitLabel="Enviar link" resetOnSuccess>
        <TextField name="email" type="email" label="E-mail" autoComplete="email" required />
      </ActionForm>
      <Link href="/login" className="text-sm font-medium text-brand-700 hover:underline">Voltar ao login</Link>
    </div>
  );
}
