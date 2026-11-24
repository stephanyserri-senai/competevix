import { EmptyState } from "@/components/ui/feedback";
import { ButtonLink } from "@/components/ui/button";
export default function NotFound() {
  return (
    <EmptyState title="Registro não encontrado" action={<ButtonLink href="/dashboard">Voltar ao painel</ButtonLink>}>
      O registro não existe ou não está no seu escopo de acesso.
    </EmptyState>
  );
}
