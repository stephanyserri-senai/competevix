import type { ReactNode } from "react";

export function PageHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  // Códigos internos do PRD (RF…, Etapa…) não aparecem para quem usa o portal
  const showEyebrow = eyebrow && !(typeof eyebrow === "string" && /^(RF\d|Etapa|Avaliação$)/.test(eyebrow));
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {showEyebrow ? <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent-700">{eyebrow}</p> : null}
        <h1 className="text-[26px] font-bold tracking-tight text-slate-900">{title}</h1>
        {description ? <p className="mt-1 max-w-3xl text-sm text-slate-500">{description}</p> : null}
      </div>
      {actions ? <div className="no-print flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}
