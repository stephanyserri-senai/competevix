import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Tabela responsiva: rola horizontalmente em telas estreitas, com legenda acessível. */
export function Table({ caption, children, className }: { caption: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto rounded-lg border border-slate-200 bg-white", className)}>
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}
export function Th({ className, ...p }: ComponentProps<"th">) {
  return <th scope="col" className={cn("bg-slate-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600", className)} {...p} />;
}
export function Td({ className, ...p }: ComponentProps<"td">) {
  return <td className={cn("px-3 py-2 align-top text-slate-800", className)} {...p} />;
}
export function Tr({ className, ...p }: ComponentProps<"tr">) {
  return <tr className={cn("border-t border-slate-100 hover:bg-slate-50/60", className)} {...p} />;
}
