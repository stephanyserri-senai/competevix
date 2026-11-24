import type { ReactNode } from "react";

export function PageHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? <p className="text-xs font-semibold uppercase tracking-wide text-accent-700">{eyebrow}</p> : null}
        <h1 className="text-2xl font-bold text-brand-900">{title}</h1>
        {description ? <p className="mt-1 max-w-3xl text-sm text-slate-600">{description}</p> : null}
      </div>
      {actions ? <div className="no-print flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}
