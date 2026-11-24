# COMPETE VIX

Portal de gestão integrada das competições do SENAI Vitória (Beira-Mar e Porto).
Documento norteador: [`docs/COMPETE_VIX_PRD.md`](docs/COMPETE_VIX_PRD.md) v0.1 (24/11/2026). Plano técnico em
[`docs/PLANO_IMPLEMENTACAO.md`](docs/PLANO_IMPLEMENTACAO.md); relatório da etapa atual em
[`docs/ETAPA_1.md`](docs/ETAPA_1.md).

> Nome, arquitetura e regras operacionais são **propostas** (PRD §1). Não publicar sem
> aprovação institucional de hospedagem e tratamento de dados (PRD §10).

## Stack

Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind CSS 4 · Supabase
(PostgreSQL, Auth, Storage privado) · Zod 4 · Recharts · Vitest · Playwright · Vercel.

## Estrutura

```
supabase/migrations/      modelo de dados, RLS, triggers e RPCs (fonte da verdade)
supabase/seed/            references.sql (dados identificados no PRD) · demo.sql (fictício, só dev)
supabase/tests/shims/     simulação mínima de auth/storage para testar RLS num PostgreSQL comum
scripts/                  db-local.sh (banco de teste) · gen-types.mjs (tipos do banco)
src/app/                  rotas: (public) login/convite · (app) módulos · api/cron
src/components/           design system (ui/) e shell (layout/)
src/features/<módulo>/    domain.ts (regras puras) · actions.ts (Server Actions) · queries.ts · componentes
src/features/schemas.ts   schemas Zod compartilhados cliente/servidor
src/lib/                  clientes Supabase, sessão/papéis, datas (America/Sao_Paulo), erros
tests/unit | tests/db | tests/e2e
```

## Configuração local

Pré-requisitos: Node 20.9+, Docker (para o Supabase CLI) e PostgreSQL 16 (opcional, só para `test:db`).

```bash
npm install
```

```bash
cp .env.example .env.local
```

### Opção A — Supabase local (recomendado)

```bash
npx supabase init
```

```bash
npx supabase start
```

Copie a URL e a chave *publishable* exibidas para `.env.local`, depois aplique migrations e seeds:

```bash
npx supabase db reset
```

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/seed/references.sql -f supabase/seed/demo.sql
```

Regere os tipos a partir do banco real:

```bash
npx supabase gen types typescript --local > src/lib/database.types.ts
```

### Opção B — projeto Supabase de desenvolvimento

1. Crie um projeto **de desenvolvimento** (sem dados reais).
2. Aplique as migrations em ordem: `npx supabase link --project-ref <ref>` e `npx supabase db push`.
3. Aplique `supabase/seed/references.sql`. O `demo.sql` é opcional e **somente** para desenvolvimento.

### Configurações obrigatórias no painel do Supabase (Auth)

- **Desabilitar cadastro público** (Authentication → Sign In / Providers → *Allow new users to sign up* = off). Acesso só por convite.
- *Site URL* = `NEXT_PUBLIC_SITE_URL`; *Redirect URLs* incluem `<site>/auth/confirm`.
- Templates de e-mail (convite e redefinição) apontando para o fluxo `token_hash`:
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/auth/definir-senha`
  (para recuperação, `type=recovery`).
- Primeiro administrador: após o primeiro convite (pelo painel do Supabase), execute no SQL Editor:
  `insert into public.platform_admins (user_id) select id from auth.users where email = '<e-mail>';`

### Rodar

```bash
npm run dev
```

Usuários de demonstração (apenas com `demo.sql`, senha `Demo-Compete-2026`):
`admin@`, `supervisao.a@`, `supervisao.b@`, `gestao@`, `orientador@`, `competidor@` — domínio `demo.compete.local`.

## Qualidade

| Comando | O que faz |
|---|---|
| `npm run lint` | ESLint (config Next) |
| `npm run typecheck` | gera tipos de rota e roda `tsc --noEmit` |
| `npm run test:unit` | regras de domínio (datas/fuso, recorrência, ICS, conflitos, ações, checklists, arquivos) |
| `npm run test:db` | recria o banco de teste e valida RLS, isolamento por escopo e regras no banco |
| `npm run test:e2e` | Playwright (desktop e mobile). Cenários autenticados: `E2E_AUTH=1` + Supabase semeado |
| `npm run build` | build de produção |

`test:db` usa `TEST_DATABASE_URL` (PostgreSQL 16 local). O script `scripts/db-local.sh` cria o banco,
aplica os *shims* de `auth`/`storage` e as migrations. Os shims **nunca** vão para o Supabase.

## Deploy (Vercel) — somente após autorização

1. Importar o repositório na Vercel; *Framework preset*: Next.js.
2. Variáveis: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SITE_URL`,
   `SUPABASE_SECRET_KEY` (server), `CRON_SECRET` (server).
3. `vercel.json` agenda `/api/cron/alertas` diariamente (Bearer `CRON_SECRET`).
4. Nenhuma migration destrutiva ou deploy de produção sem autorização (PRD §13).

## Segurança — resumo

- RLS em todas as tabelas, negando por padrão; papéis calculados no banco a partir de `auth.uid()`.
- Escopo por programa (competição × ciclo × unidade), vínculos com vigência e revogação imediata.
- FKs compostas impedem referências entre programas; escopo de programa imutável.
- Storage privado; upload direto do navegador só após registro no banco; verificação de assinatura binária; download por URL assinada de 60 s.
- Chave secreta apenas no servidor (`src/lib/supabase/admin.ts`, `server-only`).
- Auditoria com diff minimizado (campos pessoais mascarados).
