import Link from "next/link";
import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { ActionForm } from "@/components/ui/action-form";
import { SelectField, TextField } from "@/components/ui/field-errors";
import { RunButton } from "@/components/ui/run-button";
import { ArchiveButton } from "@/components/ui/archive-button";
import { ROLE_LABEL, isSupervisorAnywhere, requireAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime, todayLocal } from "@/lib/dates";
import { listPrograms, programLabel } from "@/features/programas/queries";
import { addMembership, inviteUser, revokeMembership, setUserActive } from "@/features/admin/actions";
import { saveUnit, setArchived } from "@/features/programas/actions";
import { BulkImport } from "@/features/admin/bulk-import";

export const metadata: Metadata = { title: "Configurações" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

const TABLE_LABEL: Record<string, string> = {
  units: "Unidades", competitions: "Competições", cycles: "Ciclos", programs: "Programas", stages: "Etapas",
  occupations: "Ocupações", memberships: "Vínculos de acesso", profiles: "Perfis", people: "Pessoas", teams: "Equipes",
  team_members: "Membros de equipe", checklist_templates: "Modelos de checklist", documents: "Documentos", events: "Eventos",
  platform_admins: "Administradores",
};

export default async function ConfiguracoesPage({ searchParams }: PageProps<"/configuracoes">) {
  const sp = await searchParams;
  const access = await requireAccess();
  const supabase = await createClient();
  const tab = one(sp.aba) || (access.isAdmin ? "importar" : "auditoria");
  const isSup = isSupervisorAnywhere(access);

  if (!access.isAdmin && !isSup) {
    return (
      <>
        <PageHeader eyebrow="RF15" title="Configurações" />
        <EmptyState title="Sem permissão">Configurações são acessíveis à administração e à supervisão.</EmptyState>
      </>
    );
  }

  const tabs = [
    ...(access.isAdmin ? [["importar", "Importar usuários"], ["usuarios", "Usuários e vínculos"], ["unidades", "Unidades"]] : []),
    ["parametros", "Parâmetros"],
    ["auditoria", "Auditoria"],
  ] as const;

  return (
    <>
      <PageHeader eyebrow="RF15" title="Configurações" description="Perfis, vínculos de acesso, parâmetros e trilha de auditoria. Toda alteração é registrada." />
      <nav aria-label="Seções" className="mb-6 flex flex-wrap gap-1 border-b border-slate-200">
        {tabs.map(([k, l]) => (
          <Link key={k} href={`/configuracoes?aba=${k}`} aria-current={tab === k ? "page" : undefined}
            className={`-mb-px border-b-2 px-4 py-2 text-sm ${tab === k ? "border-accent-500 font-semibold text-brand-900" : "border-transparent text-slate-600 hover:text-brand-800"}`}>
            {l}
          </Link>
        ))}
      </nav>
      {tab === "usuarios" && access.isAdmin ? <UsersTab q={one(sp.usuario)} /> : null}
      {tab === "importar" && access.isAdmin ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title="Importar usuários em massa" description="Cria usuários, vínculos de acesso (papel + unidade ou programa + vigência) e, para orientadores e competidores, o cadastro de pessoa ligado ao login." />
            <CardBody><BulkImport /></CardBody>
          </Card>
          <Card>
            <CardHeader title="Colunas do CSV" />
            <CardBody className="space-y-2 text-sm text-slate-700">
              <p><code>email; nome; papel; unidade; competicao; ciclo; inicio; fim</code></p>
              <ul className="list-disc space-y-1 pl-5">
                <li><strong>papel</strong>: supervisao, orientador, competidor, gestao ou avaliador.</li>
                <li><strong>unidade</strong>: código (BEIRA-MAR, PORTO) ou nome.</li>
                <li><strong>competicao</strong> + <strong>ciclo</strong>: códigos do programa (ex.: WORLDSKILLS e 2027). Em branco = unidade inteira (só supervisão e gestão).</li>
                <li><strong>inicio</strong>/<strong>fim</strong>: opcionais (DD/MM/AAAA). Avaliadores: informe o fim.</li>
                <li>Mais de um papel ou programa para a mesma pessoa = uma linha para cada.</li>
              </ul>
              <p>Primeiro clique em <strong>Validar</strong>: nada é gravado até não haver erros e você clicar em <strong>Importar</strong>. Linhas repetidas em nova importação são ignoradas (“vínculo já existia”).</p>
              <p className="text-xs text-slate-500">Vincular pessoas às equipes continua em Equipes (supervisão).</p>
            </CardBody>
          </Card>
        </div>
      ) : null}
      {tab === "unidades" && access.isAdmin ? <UnitsTab /> : null}
      {tab === "parametros" ? <ParamsTab /> : null}
      {tab === "auditoria" ? <AuditTab table={one(sp.tabela)} /> : null}
    </>
  );

  async function UsersTab({ q }: { q: string }) {
    const [{ data: users, error }, programs, { data: units }, { data: memberships }] = await Promise.all([
      supabase.rpc("admin_list_users"),
      listPrograms(supabase, { includeArchived: true }),
      supabase.from("units").select("id, name").order("name"),
      supabase.from("memberships").select("*").order("created_at", { ascending: false }),
    ]);
    if (error) return <Alert tone="error">{error.message}</Alert>;
    const progName = new Map(programs.map((p) => [p.id, programLabel(p)]));
    const unitName = new Map((units ?? []).map((u) => [u.id, u.name]));
    const today = todayLocal();
    const activePrograms = programs.filter((p) => !p.archived_at);
    const filtered = (users ?? []).filter((u) => !q || `${u.display_name} ${u.email}`.toLowerCase().includes(q.toLowerCase()));

    return (
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <form method="get" className="flex gap-2" role="search">
            <input type="hidden" name="aba" value="usuarios" />
            <label htmlFor="busca-u" className="sr-only">Buscar usuário</label>
            <input id="busca-u" name="usuario" defaultValue={q} placeholder="Nome ou e-mail…" className="h-10 flex-1 rounded-md border border-slate-300 px-3 text-sm" />
            <button className="h-10 rounded-md bg-brand-700 px-4 text-sm font-medium text-white">Buscar</button>
          </form>
          {filtered.length === 0 ? <EmptyState title="Nenhum usuário" /> : filtered.map((u) => {
            const ms = (memberships ?? []).filter((m) => m.user_id === u.id);
            return (
              <Card key={u.id} as="article">
                <CardHeader
                  title={<>{u.display_name} {u.is_admin ? <Badge tone="accent">Administração</Badge> : null} {!u.active ? <Badge tone="danger">Inativo</Badge> : null}</>}
                  description={u.email}
                  actions={u.id !== access.userId ? (
                    <RunButton
                      label={u.active ? "Desativar" : "Reativar"}
                      variant={u.active ? "danger" : "secondary"}
                      confirm={u.active ? "Desativar este usuário? O acesso é revogado imediatamente." : undefined}
                      onRun={setUserActive.bind(null, u.id, !u.active)}
                    />
                  ) : <Badge>Você</Badge>}
                />
                <CardBody className="space-y-3">
                  {ms.length === 0 ? <p className="text-sm text-slate-600">Sem vínculos de acesso.</p> : (
                    <ul className="divide-y divide-slate-100 text-sm">
                      {ms.map((m) => {
                        const vigente = !m.revoked_at && m.valid_from <= today && (!m.valid_to || m.valid_to >= today);
                        return (
                          <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                            <span>
                              <strong>{ROLE_LABEL[m.role]}</strong> · {m.program_id ? progName.get(m.program_id) : `Unidade: ${unitName.get(m.unit_id ?? "")}`}
                              <span className="ml-1 text-xs text-slate-500">({formatDate(m.valid_from)} → {m.valid_to ? formatDate(m.valid_to) : "sem término"})</span>
                              {m.revoked_at ? <Badge tone="danger" className="ml-1">Revogado {formatDate(m.revoked_at.slice(0, 10))}</Badge> : vigente ? <Badge tone="success" className="ml-1">Vigente</Badge> : <Badge className="ml-1">Fora da vigência</Badge>}
                            </span>
                            {!m.revoked_at ? <RunButton label="Revogar" onRun={revokeMembership.bind(null, m.id)} confirm="Revogar este vínculo? Efeito imediato." /> : null}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {activePrograms.length === 0 && (units ?? []).length === 0 ? (
                    <Alert tone="warning" title="Nenhum programa ou unidade cadastrado">
                      Execute o cadastro inicial (<code>supabase/seed/references.sql</code>) no SQL Editor do Supabase ou cadastre unidades
                      na aba Unidades e programas em Competições antes de criar vínculos.
                    </Alert>
                  ) : null}
                  <details>
                    <summary className="cursor-pointer text-sm font-medium text-brand-700">+ Novo vínculo de acesso</summary>
                    <ActionForm action={addMembership} schema="membership" resetOnSuccess submitLabel="Criar vínculo" className="mt-3 grid gap-3 sm:grid-cols-2">
                      <input type="hidden" name="user_id" value={u.id} />
                      <SelectField id={`sc-${u.id}`} name="scope" label="Escopo" defaultValue="programa" hint="Por unidade: só Supervisão e Gestão.">
                        <option value="programa">Programa</option>
                        <option value="unidade">Unidade inteira</option>
                      </SelectField>
                      <SelectField id={`ro-${u.id}`} name="role" label="Papel" defaultValue="orientador">
                        {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </SelectField>
                      <SelectField id={`pr-${u.id}`} name="program_id" label="Programa" defaultValue="">
                        <option value="">—</option>
                        {activePrograms.map((p) => <option key={p.id} value={p.id}>{programLabel(p)}</option>)}
                      </SelectField>
                      <SelectField id={`un-${u.id}`} name="unit_id" label="Unidade" defaultValue="">
                        <option value="">—</option>
                        {(units ?? []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                      </SelectField>
                      <TextField id={`vf-${u.id}`} name="valid_from" type="date" label="Início" defaultValue={today} required />
                      <TextField id={`vt-${u.id}`} name="valid_to" type="date" label="Fim (opcional)" hint="Avaliadores: acesso temporário." />
                      <TextField id={`nt-${u.id}`} name="note" label="Observação" className="sm:col-span-2" />
                    </ActionForm>
                  </details>
                </CardBody>
              </Card>
            );
          })}
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Convidar usuário" description="Sem cadastro público. O convite chega por e-mail para definir a senha." />
            <CardBody>
              <ActionForm action={inviteUser} schema="invite" resetOnSuccess submitLabel="Enviar convite">
                <TextField name="email" type="email" label="E-mail institucional" required />
                <TextField name="display_name" label="Nome de exibição" required />
              </ActionForm>
            </CardBody>
          </Card>
          <Alert tone="info" title="Administração ≠ acesso a dados">
            Administradores provisionam usuários e configurações, mas só veem dados operacionais com vínculo próprio. Aprovações registradas no portal não substituem autorização institucional.
          </Alert>
          <Alert tone="warning" title="Avaliador e NAPI">
            Bancas (avaliador) chegam na etapa 3. NAPI fica restrito a encaminhamento administrativo, sem diagnóstico ou prontuário (fora do MVP clínico).
          </Alert>
        </div>
      </div>
    );
  }

  async function UnitsTab() {
    const { data: units } = await supabase.from("units").select("*").order("name");
    return (
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Unidades" />
          <CardBody>
            <ul className="divide-y divide-slate-100">
              {(units ?? []).map((u) => (
                <li key={u.id} className="py-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{u.name} <span className="text-xs text-slate-500">({u.code})</span> {u.archived_at ? <Badge>Arquivada</Badge> : null}</p>
                    <ArchiveButton archived={Boolean(u.archived_at)} onToggle={setArchived.bind(null, "units", u.id, !u.archived_at, "/configuracoes")} />
                  </div>
                  <details className="mt-1">
                    <summary className="cursor-pointer text-sm text-brand-700">Editar</summary>
                    <ActionForm action={saveUnit} schema="unit" className="mt-2 grid gap-3 sm:grid-cols-2">
                      <input type="hidden" name="id" value={u.id} />
                      <TextField id={`uc-${u.id}`} name="code" label="Código" defaultValue={u.code} required />
                      <TextField id={`un-${u.id}`} name="name" label="Nome" defaultValue={u.name} required />
                    </ActionForm>
                  </details>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Nova unidade" description="Suporte a múltiplas unidades sem alteração de código." />
          <CardBody>
            <ActionForm action={saveUnit} schema="unit" resetOnSuccess submitLabel="Criar unidade">
              <TextField name="code" label="Código" required placeholder="EX: SAO-MATEUS" />
              <TextField name="name" label="Nome" required />
            </ActionForm>
          </CardBody>
        </Card>
      </div>
    );
  }

  async function ParamsTab() {
    const programs = await listPrograms(supabase);
    const editable = programs.filter((p) => access.isAdmin || (access.roles[p.id] ?? []).includes("supervisao"));
    return (
      <Card>
        <CardHeader title="Parâmetros por programa" description="Regras configuráveis nesta etapa. Metas, cadências e rubricas detalhadas chegam com os módulos das etapas 2 e 3." />
        <CardBody>
          {editable.length === 0 ? <EmptyState title="Nenhum programa editável" /> : (
            <ul className="divide-y divide-slate-100">
              {editable.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                  {programLabel(p)}
                  <Link href={`/competicoes/${p.id}`} className="text-brand-700 hover:underline">Abrir parâmetros →</Link>
                </li>
              ))}
            </ul>
          )}
          <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-slate-700">
            <li>Conclusão de ações: exigência de justificativa e/ou evidência (por programa).</li>
            <li>Cadência de checklists: definida no modelo (semanal, mensal, avulsa).</li>
            <li>Metas de pontuação: por ocupação, com fonte obrigatória.</li>
          </ul>
        </CardBody>
      </Card>
    );
  }

  async function AuditTab({ table }: { table: string }) {
    let q = supabase.from("audit_log").select("*").order("occurred_at", { ascending: false }).limit(100);
    if (table && table in TABLE_LABEL) q = q.eq("table_name", table);
    const [{ data: logs }, programs] = await Promise.all([q, listPrograms(supabase, { includeArchived: true })]);
    const actorIds = [...new Set((logs ?? []).map((l) => l.actor).filter((x): x is string => Boolean(x)))];
    const { data: actors } = actorIds.length ? await supabase.from("profiles").select("id, display_name").in("id", actorIds) : { data: [] };
    const actorName = new Map((actors ?? []).map((a) => [a.id, a.display_name]));
    const progName = new Map(programs.map((p) => [p.id, programLabel(p)]));
    return (
      <Card>
        <CardHeader title="Trilha de auditoria" description="Últimos 100 registros visíveis ao seu papel. Campos pessoais aparecem apenas como “«alterado»”." />
        <CardBody className="space-y-4">
          <form method="get" className="flex items-end gap-2">
            <input type="hidden" name="aba" value="auditoria" />
            <label className="text-sm"><span className="mb-1 block font-medium">Entidade</span>
              <select name="tabela" defaultValue={table} className="h-10 rounded-md border border-slate-300 bg-white px-2">
                <option value="">Todas</option>
                {Object.entries(TABLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <button className="h-10 rounded-md bg-brand-700 px-4 text-sm font-medium text-white">Filtrar</button>
          </form>
          {(logs ?? []).length === 0 ? <EmptyState title="Sem registros visíveis" /> : (
            <Table caption="Auditoria">
              <thead><tr><Th>Quando</Th><Th>Quem</Th><Th>Entidade</Th><Th>Operação</Th><Th>Alterações</Th></tr></thead>
              <tbody>
                {(logs ?? []).map((l) => (
                  <Tr key={l.id}>
                    <Td className="whitespace-nowrap text-xs">{formatDateTime(l.occurred_at)}</Td>
                    <Td className="text-xs">{l.actor ? actorName.get(l.actor) ?? "Usuário" : "Sistema/migração"}</Td>
                    <Td className="text-xs">{TABLE_LABEL[l.table_name] ?? l.table_name}{l.program_id ? <p className="text-slate-500">{progName.get(l.program_id) ?? ""}</p> : null}</Td>
                    <Td><Badge tone={l.operation === "DELETE" ? "danger" : l.operation === "INSERT" ? "success" : "info"}>{{ INSERT: "Criação", UPDATE: "Alteração", DELETE: "Exclusão" }[l.operation as "INSERT"]}</Badge></Td>
                    <Td className="max-w-md text-xs text-slate-700"><code className="break-all">{l.changed ? Object.keys(l.changed as object).join(", ") : "—"}</code></Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>
    );
  }
}
