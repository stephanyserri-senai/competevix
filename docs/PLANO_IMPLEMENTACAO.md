# COMPETE VIX — Plano de implementação

Documento norteador: `COMPETE_VIX_PRD.md` v0.1 (24/11/2026). Este plano registra as decisões
técnicas tomadas na leitura do PRD e como cada etapa será entregue. Tudo aqui é **proposta**
sujeita à validação da supervisão e da gestão (PRD §1 e §14).

## 1. Diagnóstico inicial

- Repositório `stephanyserri-senai/competevix` vazio → projeto inicializado do zero (PRD §13).
- Ambiente de desenvolvimento sem acesso às imagens Docker do Supabase. As migrations são
  validadas num PostgreSQL 16 local com *shims* mínimos dos esquemas `auth` e `storage`
  do Supabase (`supabase/tests/shims`). Em produção/homologação usa-se o Supabase real.

## 2. Arquitetura

| Camada | Escolha | Observação |
|---|---|---|
| Web | Next.js 16 (App Router), React 19, TypeScript `strict` | `proxy.ts` (antigo middleware) renova a sessão |
| Estilo | Tailwind CSS 4, componentes próprios acessíveis | azul institucional + laranja; sem logotipos oficiais |
| Dados | Supabase PostgreSQL + Auth + Storage privado | RLS “nega por padrão” em todas as tabelas |
| Validação | Zod 4 compartilhado entre cliente e servidor | `src/features/*/schemas.ts` |
| Gráficos | Recharts | apenas onde há dado real; vazio ≠ zero |
| Testes | Vitest (unidade + banco/RLS), Playwright (E2E) | |
| Deploy | Vercel + GitHub | **nenhum deploy sem autorização** |

### Organização de pastas

```
supabase/migrations     SQL versionado (fonte da verdade do modelo)
supabase/seed           references.sql (referências identificadas do PRD) e demo.sql (fictício, só dev)
supabase/tests/shims    simulação de auth/storage para testar RLS fora do Supabase
src/app                 rotas (UI fina: busca dados e compõe componentes)
src/components          design system (botões, cards, tabelas, estados vazio/erro/carregando)
src/lib                 clientes Supabase, datas/fuso, autorização na UI, utilitários
src/features/<módulo>   domain.ts (regras puras e testáveis) · schemas.ts (Zod) ·
                        queries.ts (leitura) · actions.ts (server actions) · components/
tests/unit | tests/db | tests/e2e
```

Separação exigida no PRD §3: **domínio** (funções puras: atraso, recorrência, conflitos, ICS,
ciclos de dependência, CH) → **serviços/ações** (server actions validando com Zod) →
**acesso a dados** (Supabase com sessão do usuário, sujeito a RLS) → **UI**.

## 3. Modelo de autorização (PRD §4)

- **Escopo = programa** (`programs` = competição × ciclo × unidade). Vínculos (`memberships`)
  podem apontar para um programa **ou** para uma unidade inteira (útil para Gestão e
  Supervisão de unidade, sem recadastro a cada novo programa).
- Papéis: `supervisao`, `orientador`, `competidor`, `gestao`, `avaliador`, `napi`.
  Administrador é marcado em `platform_admins` (fora do alcance do cliente) e **não** recebe
  leitura automática de dados operacionais.
- Vigência (`valid_from/valid_to`) e revogação (`revoked_at`) checadas em toda política →
  revogação tem efeito imediato. Perfil inativo perde todo acesso.
- Orientador e competidor são restringidos às **equipes** em que estão vinculados
  (`team_members` com vigência). Gestão = leitura. Avaliador e NAPI = nada no MVP 1
  (bancas na fase 3; NAPI só encaminhamento administrativo, fora do MVP clínico).
- Funções `SECURITY DEFINER` com `search_path` fixo concentram as regras; políticas RLS
  chamam essas funções. A interface **nunca** envia papel; filtros da UI são só conveniência.
- Integridade de escopo: FKs compostas `(id, program_id)` impedem que uma equipe, ação,
  evento ou evidência referencie registro de outro programa/unidade/ciclo.
- Storage: bucket privado `documentos`, caminho `{program_id}/{uuid}`; políticas de
  `storage.objects` reaplicam as mesmas regras; download por URL assinada de 60 s.

## 4. Etapas

| Etapa | Conteúdo | Critério de aceite (PRD §12) |
|---|---|---|
| **1 — Fundação (MVP 1)** | scaffold, migrations, autenticação por convite, RLS, unidades/competições/ciclos/programas/etapas/ocupações, pessoas, equipes com vigência, agenda (recorrência, exceções, conflitos, ICS), ações (kanban/tabela, dependências sem ciclos, evidências, histórico), checklists versionados, documentos privados (núcleo do RF13), dashboard, configurações e auditoria | usuários de escopos diferentes não acessam dados cruzados; CRUD e filtros persistem; seed só com referências identificadas |
| 2 — WorldSkills | alocações, competências, plano versionado, sessões, presença, simulados, erros/causa raiz, rampas, fechamento semanal (RF06/RF07) | CH correta com jornada variável, ausência e equipe dupla; comparar só escalas equivalentes |
| 3 — INOVA | projetos, funil com evidências, rubricas versionadas, bancas, avaliadores temporários (RF08) | bloquear notas fora do limite, publicação incompleta e avanço sem evidência; histórico |
| 4 — Gestão de recursos | recursos, orçamento, benchmarking, riscos, relatórios/CSV, documentos completos (RF09–RF14) | saldo reconciliado; exportação respeita permissões; indicadores reproduzíveis |
| 5 — Expansão | FRC/Giaffone/E-Kart específicos, integrações; IA só com governança | após levantamento |

As tabelas de fases futuras **não** são criadas agora (evita esquema especulativo), mas
os pontos de extensão já existem: `programs.settings`, `competitions.kind`, vínculos por
equipe, `documents` + tabelas de associação por tipo, `audit_log` genérico,
`notifications` com `dedupe_key`.

## 5. Decisões e justificativas de escopo no MVP 1

- **Rotas de fases futuras** (`/worldskills`, `/inova`, `/recursos`, `/orcamento`,
  `/benchmarking`, `/riscos`, `/relatorios`, `/acompanhamentos`) aparecem na navegação
  identificadas como “Prevista na etapa N”, sem formulários falsos (PRD §13).
- **Backlog da reunião (PRD §11)**: os itens não indicam programa/unidade. Em vez de
  inventar vínculo no seed, a Supervisão importa cada grupo para o programa escolhido
  (`/acoes` → “Importar backlog da reunião”), sem responsáveis e sem prazos, exceto a
  janela 30/11–04/12/2026 da reunião com orientadores.
- **Datas de ciclo** são opcionais: o PRD não informa datas oficiais; o seed cria o
  “Ciclo 2027” sem datas.
- **Metas das ocupações** (760/750/770) entram no seed de referências com a origem
  “infográfico da gestão — validar”. Não há conversão de escala nem metas intermediárias.
- **Alertas**: função `refresh_alerts()` gera notificações idempotentes (prazo vencido,
  checklist pendente) e as resolve quando a condição cessa; disparo por rota protegida
  (`/api/cron/alertas`, cron da Vercel). Sem envio externo.
- **Tipos do banco**: sem Docker para o `supabase gen types`, um gerador próprio
  (`scripts/gen-types.mjs`) lê o catálogo do PostgreSQL e produz o mesmo formato.
