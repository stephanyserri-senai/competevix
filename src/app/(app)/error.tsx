"use client";

import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="space-y-4">
      <Alert tone="error" title="Não foi possível carregar esta página">
        Tente novamente. Se o problema persistir, informe o código {error.digest ?? "—"} à administração.
      </Alert>
      <Button onClick={reset} variant="secondary">Tentar novamente</Button>
    </div>
  );
}
