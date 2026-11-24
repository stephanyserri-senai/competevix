"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { invalid, parseForm, type FormState } from "@/lib/forms";

const loginSchema = z.object({
  email: z.email({ message: "Informe um e-mail válido." }).max(200),
  password: z.string().min(1, "Informe a senha.").max(200),
  next: z.string().optional(),
});

/** Redireciona só para caminhos internos (evita open redirect). */
function safeNext(next?: string) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

export async function signIn(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(loginSchema, formData);
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
  if (error) {
    // Mensagem genérica: não revela se o e-mail existe
    return { ok: false, message: "E-mail ou senha inválidos, ou acesso não liberado.", at: Date.now() };
  }
  redirect(safeNext(parsed.data.next));
}

const passwordSchema = z
  .object({
    password: z
      .string()
      .min(10, "A senha deve ter pelo menos 10 caracteres.")
      .max(200)
      .regex(/[A-Za-z]/, "Inclua letras.")
      .regex(/\d/, "Inclua números."),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { path: ["confirm"], message: "As senhas não coincidem." });

export async function setPassword(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(passwordSchema, formData);
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { ok: false, message: "Não foi possível definir a senha. O link pode ter expirado.", at: Date.now() };
  redirect("/dashboard");
}

const recoverSchema = z.object({ email: z.email({ message: "Informe um e-mail válido." }) });

export async function requestPasswordReset(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(recoverSchema, formData);
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  await supabase.auth.resetPasswordForEmail(parsed.data.email, { redirectTo: `${site}/auth/confirm?next=/auth/definir-senha` });
  // Resposta idêntica exista ou não o e-mail
  return { ok: true, message: "Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.", at: Date.now() };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
