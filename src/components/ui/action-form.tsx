"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { z } from "zod";
import { SCHEMAS, type SchemaKey } from "@/features/schemas";
import { parseForm } from "@/lib/forms";
import { useFormStatus } from "react-dom";
import type { FormState } from "@/lib/forms";
import { Alert } from "./feedback";
import { buttonClass } from "./button";
import { FieldErrorsContext } from "./field-errors";

/**
 * Formulário ligado a uma Server Action. Mostra mensagens de sucesso/erro
 * vindas do servidor (validação Zod + regras do banco) e erros por campo.
 */
export function ActionForm({
  action,
  children,
  submitLabel = "Salvar",
  submitVariant = "primary",
  resetOnSuccess = false,
  className,
  hideSubmit = false,
  confirmMessage,
  schema,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  children: ReactNode;
  submitLabel?: string;
  submitVariant?: "primary" | "secondary" | "danger" | "accent";
  resetOnSuccess?: boolean;
  className?: string;
  hideSubmit?: boolean;
  confirmMessage?: string;
  /** Validação no cliente com o MESMO schema Zod usado pela Server Action */
  schema?: SchemaKey;
}) {
  const [state, formAction] = useActionState(action, null);
  const [localErrors, setLocalErrors] = useState<Record<string, string[] | undefined> | null>(null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form
      ref={ref}
      action={formAction}
      className={className ?? "space-y-4"}
      noValidate
      onSubmit={(e) => {
        if (schema) {
          const parsed = parseForm(SCHEMAS[schema], new FormData(e.currentTarget));
          if (!parsed.success) {
            e.preventDefault();
            setLocalErrors(z.flattenError(parsed.error).fieldErrors as Record<string, string[] | undefined>);
            return;
          }
        }
        setLocalErrors(null);
        if (confirmMessage && !window.confirm(confirmMessage)) e.preventDefault();
      }}
    >
      <FieldErrorsContext value={localErrors ?? state?.fieldErrors ?? {}}>{children}</FieldErrorsContext>
      {localErrors ? <Alert tone="error">Revise os campos destacados.</Alert> : null}
      {!localErrors && state?.message ? (
        <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>
      ) : null}
      {hideSubmit ? null : <SubmitButton label={submitLabel} variant={submitVariant} />}
    </form>
  );
}

export function SubmitButton({ label, variant = "primary", size = "md" }: { label: string; variant?: "primary" | "secondary" | "danger" | "accent"; size?: "sm" | "md" }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={buttonClass(variant, size)}>
      {pending ? "Enviando…" : label}
    </button>
  );
}
