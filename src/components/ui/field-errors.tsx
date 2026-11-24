"use client";

import { createContext, use, type ComponentProps, type ReactNode } from "react";
import { Field, Input, Select, Textarea } from "./field";

export const FieldErrorsContext = createContext<Record<string, string[] | undefined>>({});

/** Campos que leem automaticamente os erros do ActionForm pelo `name`. */
type Base = { name: string; label: ReactNode; hint?: ReactNode; required?: boolean; className?: string };

export function TextField({ name, label, hint, required, className, ...p }: Base & Omit<ComponentProps<"input">, "name">) {
  const err = use(FieldErrorsContext)[name];
  const id = p.id ?? `f-${name}`;
  return (
    <Field label={label} htmlFor={id} hint={hint} error={err} required={required} className={className}>
      <Input id={id} name={name} required={required} aria-invalid={Boolean(err)} aria-describedby={err ? `${id}-error` : hint ? `${id}-hint` : undefined} {...p} />
    </Field>
  );
}

export function SelectField({ name, label, hint, required, className, children, ...p }: Base & Omit<ComponentProps<"select">, "name">) {
  const err = use(FieldErrorsContext)[name];
  const id = p.id ?? `f-${name}`;
  return (
    <Field label={label} htmlFor={id} hint={hint} error={err} required={required} className={className}>
      <Select id={id} name={name} required={required} aria-invalid={Boolean(err)} aria-describedby={err ? `${id}-error` : hint ? `${id}-hint` : undefined} {...p}>
        {children}
      </Select>
    </Field>
  );
}

export function TextareaField({ name, label, hint, required, className, ...p }: Base & Omit<ComponentProps<"textarea">, "name">) {
  const err = use(FieldErrorsContext)[name];
  const id = p.id ?? `f-${name}`;
  return (
    <Field label={label} htmlFor={id} hint={hint} error={err} required={required} className={className}>
      <Textarea id={id} name={name} required={required} aria-invalid={Boolean(err)} aria-describedby={err ? `${id}-error` : hint ? `${id}-hint` : undefined} {...p} />
    </Field>
  );
}
