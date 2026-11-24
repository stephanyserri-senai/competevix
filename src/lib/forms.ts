import { z } from "zod";
import { translateDbError, type DbError } from "@/lib/errors";

export type FormState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  /** Muda a cada envio, permitindo que a UI reaja (ex.: limpar formulário) */
  at?: number;
} | null;

export const initialFormState: FormState = null;

/** Converte FormData em objeto (campos repetidos viram arrays) e valida com Zod. */
export function parseForm<S extends z.ZodType>(schema: S, formData: FormData) {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of formData.entries()) {
    if (k.startsWith("$ACTION")) continue;
    const value = typeof v === "string" ? v : v;
    if (k in obj) {
      const prev = obj[k];
      obj[k] = Array.isArray(prev) ? [...prev, value] : [prev, value];
    } else {
      obj[k] = value;
    }
  }
  return schema.safeParse(obj);
}

export function invalid(error: z.ZodError): FormState {
  const flat = z.flattenError(error);
  return {
    ok: false,
    message: flat.formErrors[0] ?? "Revise os campos destacados.",
    fieldErrors: flat.fieldErrors as Record<string, string[] | undefined>,
    at: Date.now(),
  };
}

export function dbFailure(error: DbError): FormState {
  return { ok: false, message: translateDbError(error), at: Date.now() };
}

export function success(message: string): FormState {
  return { ok: true, message, at: Date.now() };
}

/* Pré-processadores comuns para FormData */
export const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
export const zText = (min: number, max: number, label: string) =>
  z.string().trim().min(min, `${label}: mínimo de ${min} caracteres.`).max(max, `${label}: máximo de ${max} caracteres.`);
export const zOptText = (max: number, label: string) =>
  z.preprocess(emptyToNull, z.string().trim().max(max, `${label}: máximo de ${max} caracteres.`).nullable());
export const zUuid = (label = "Registro") => z.uuid({ message: `${label} inválido.` });
export const zOptUuid = (label = "Registro") => z.preprocess(emptyToNull, z.uuid({ message: `${label} inválido.` }).nullable());
export const zDate = (label = "Data") => z.iso.date({ message: `${label} inválida.` });
export const zOptDate = (label = "Data") => z.preprocess(emptyToNull, z.iso.date({ message: `${label} inválida.` }).nullable());
export const zCheckbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());
