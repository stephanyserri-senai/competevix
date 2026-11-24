import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

const control =
  "block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-500 disabled:bg-slate-100 aria-[invalid=true]:border-red-600";

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor: string;
  hint?: ReactNode;
  error?: string[] | string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const err = Array.isArray(error) ? error[0] : error;
  return (
    <div className={cn("space-y-1", className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-800">
        {label}
        {required ? <span className="text-red-700" aria-hidden> *</span> : null}
      </label>
      {children}
      {hint && !err ? <p id={`${htmlFor}-hint`} className="text-xs text-slate-600">{hint}</p> : null}
      {err ? <p id={`${htmlFor}-error`} role="alert" className="text-xs font-medium text-red-700">{err}</p> : null}
    </div>
  );
}

export function Input({ className, ...p }: ComponentProps<"input">) {
  return <input className={cn(control, className)} {...p} />;
}
export function Select({ className, ...p }: ComponentProps<"select">) {
  return <select className={cn(control, "pr-8", className)} {...p} />;
}
export function Textarea({ className, ...p }: ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-20", className)} {...p} />;
}
export function Checkbox({ label, id, className, ...p }: ComponentProps<"input"> & { label: ReactNode; id: string }) {
  return (
    <label htmlFor={id} className={cn("flex items-start gap-2 text-sm text-slate-800", className)}>
      <input id={id} type="checkbox" className="mt-0.5 size-4 rounded border-slate-400 text-brand-700" {...p} />
      <span>{label}</span>
    </label>
  );
}
