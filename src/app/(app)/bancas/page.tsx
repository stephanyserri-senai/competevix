import Link from "next/link";
import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { requireAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/dates";

export const metadata: Metadata = { title: "Minhas bancas" };

/** Área do avaliador: somente as bancas atribuídas a ele(a) (acesso temporário — PRD §4). */
export default async function MinhasBancasPage() {
  const access = await requireAccess();
  const supabase = await createClient();
  const { data } = await supabase
    .from("panel_assignments")
    .select("id, status, panel:panels(id, title, held_on, status, project:projects(title))")
    .eq("evaluator_id", access.userId);
  const rows = (data ?? []).filter((a) => a.panel).sort((a, b) => (a.panel!.held_on < b.panel!.held_on ? 1 : -1));
  return (
    <>
      <PageHeader eyebrow="Avaliação" title="Minhas bancas" description="Bancas para as quais você foi designado(a). Sua avaliação é independente: as notas de outros avaliadores não aparecem até a publicação." />
      {rows.length === 0 ? <EmptyState title="Nenhuma banca atribuída">Se você é avaliador(a), aguarde a designação pela supervisão do programa.</EmptyState> : (
        <Table caption="Bancas atribuídas">
          <thead><tr><Th>Banca</Th><Th>Projeto</Th><Th>Data</Th><Th>Sua avaliação</Th></tr></thead>
          <tbody>
            {rows.map((a) => (
              <Tr key={a.id}>
                <Td><Link href={`/inova/bancas/${a.panel!.id}`} className="font-medium text-brand-700 hover:underline">{a.panel!.title}</Link></Td>
                <Td className="text-xs">{a.panel!.project?.title}</Td>
                <Td className="text-xs">{formatDate(a.panel!.held_on)}</Td>
                <Td>{a.panel!.status !== "planejada" ? <Badge>Banca encerrada</Badge> : a.status === "submetida" ? <Badge tone="success">Enviada</Badge> : <Badge tone="warning">Pendente</Badge>}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
