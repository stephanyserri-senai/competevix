# Etapa 1 — Fundação (MVP 1) · Relatório

Data: 24/11/2026 · Referência: PRD v0.1 §12 (item 1) · Plano: `docs/PLANO_IMPLEMENTACAO.md`

## 1. Funcionalidades implementadas

| Área | Rota | Entrega |
|---|---|---|
| Autenticação | `/login`, `/auth/*` | Login por e-mail/senha; convite (sem cadastro público); definição e recuperação de senha via `token_hash`; mensagens que não revelam se o e-mail existe; proxy renova a sessão |
| Autorização | banco | RLS “nega por padrão” em 26 tabelas; papéis calculados no banco a partir de `auth.uid()`; vínculo por programa ou unidade; vigência e revogação imediata; perfil inativo perde todo acesso; administração sem acesso automático a dados operacionais |
| RF01 Painel | `/dashboard` | Filtros ciclo/unidade/competição; ações abertas/atrasadas/bloqueadas/a vencer; checklists pendentes; metas por ocupação com fonte; desvio “N/A” sem nota comparável; próximos eventos; gráfico por status com tabela equivalente; origem e data de corte em cada indicador; “sem dados” ≠ zero |
| RF02 Competições | `/competicoes`, `/competicoes/[id]` | Catálogo de competições e ciclos (admin); programas (competição × ciclo × unidade) com escopo imutável; etapas; ocupações com meta e fonte obrigatória; parâmetros do programa; arquivamento sem apagar histórico |
| RF03 Equipes | `/equipes`, `/equipes/[id]`, `/equipes/pessoas` | Equipes com vários competidores; competidor, suplente, orientador titular/reserva com vigência (sobreposição bloqueada no banco); encerramento de vigência preservando histórico; cadastro mínimo de pessoas; vínculo pessoa↔login pela supervisão |
| RF04 Agenda | `/agenda`, `/agenda/[id]`, `/agenda/ics` | Visões mensal e semanal; recorrência diária/semanal (dias)/mensal com término obrigatório; exceções por ocorrência (cancelar/alterar e desfazer); responsável e participantes; conflitos por pessoa ou equipe; exportação ICS (RRULE, EXDATE, RECURRENCE-ID, fuso America/Sao_Paulo) |
| RF05 Ações | `/acoes`, `/acoes/[id]` | Tabela paginada e kanban; filtros na URL (status, prioridade, equipe, responsável, atrasadas, busca); responsável, início, prazo, prioridade; transições validadas; bloqueio e reabertura exigem justificativa; conclusão conforme regra do programa e/ou da ação; dependências sem ciclos (bloqueiam conclusão); evidências (arquivo ou link); histórico automático e comentários; importação idempotente do backlog da reunião 24/11 |
| Checklists | `/checklists`, `/checklists/modelos/[id]`, `/checklists/[id]` | Modelos versionados (rascunho → publicado → substituído); itens obrigatórios e com exigência de evidência; aplicação por período e equipe/programa (única por período); conclusão transacional validando obrigatórios e evidências; aplicação concluída imutável |
| RF13 (núcleo) Documentos | `/documentos` | Storage privado; caminho aleatório por programa; validação de MIME/tamanho no cliente, servidor, banco e bucket; verificação de assinatura binária; classificação (interno/restrito/confidencial); versão; download por URL assinada de 60 s |
| RF15 Configurações | `/configuracoes` | Convite e desativação de usuários; vínculos de acesso com vigência e revogação; unidades; parâmetros; trilha de auditoria com diff minimizado |
| Alertas | `/notificacoes`, `/api/cron/alertas` | Prazo vencido e checklist pendente; uma notificação por entidade/período/regra; resolução automática; rotina agendada protegida por segredo; sem envio externo |
| Etapas futuras | `/acompanhamentos`, `/worldskills`, `/inova`, `/recursos`, `/orcamento`, `/benchmarking`, `/riscos`, `/relatorios` | Páginas informativas com escopo, critérios de aceite e decisões pendentes — **sem formulários ou dados simulados** |

### Seeds

- `supabase/seed/references.sql`: unidades Beira-Mar e Porto; competições WorldSkills, INOVA, FRC, Giaffone, E-Kart; ciclo 2027 **sem datas** (renomeado para 2027–2028 em 25/11/2026); programas WS Beira-Mar, WS Porto e INOVA Beira-Mar; ocupações #33 (760), #48 (750), #50 (770) com a fonte “infográfico — validar”. Nenhuma pessoa, nota ou data inventada.
- `supabase/seed/demo.sql`: dados fictícios rotulados `[DEMO]`, em unidades e ciclo próprios (DEMO-A, DEMO-B, DEMO), apenas para desenvolvimento.
- Backlog da reunião (PRD §11): importado pela interface para o programa escolhido pela supervisão, porque o PRD não indica a que programa/unidade pertence cada item.

## 2. Testes realizados

| Comando | Resultado |
|---|---|
| `npm run lint` | sem erros nem avisos |
| `npm run typecheck` | sem erros |
| `npm run test` (unit + banco) | **63/63** aprovados |
| `npm run build` | build de produção concluído, 35 rotas |
| `npm run test:e2e` | **20/20** aprovados (desktop e mobile); 10 cenários autenticados pulados (ver §3) |

Cobertura relevante:

- **Aceite “dois usuários de escopos diferentes não acessam dados cruzados”** (`tests/db/rls.test.ts`, 21 testes): supervisão de unidades distintas, gestão por unidade, orientador restrito às equipes que orienta, competidor restrito à própria equipe, administrador sem dados operacionais, usuário sem vínculo, visitante anônimo, autoatribuição de papel, revogação imediata, perfil desativado, vínculo fora da vigência, escopo imutável, pessoa de outra unidade, `INSERT … RETURNING` (padrão do supabase-js), vínculo pessoa↔login, privilégios do papel anônimo.
- **Regras no banco** (`tests/db/regras.test.ts`, 20 testes): fluxo de ações, justificativas, dependências sem ciclo e entre programas, regra de evidência do programa, atraso calculado, histórico não forjável, checklists (publicação, imutabilidade, versões, conclusão), documentos e políticas de Storage (incluindo confidencial e upload órfão), exceções de agenda, alertas idempotentes, auditoria mascarada.
- **Domínio** (`tests/unit`, 22 testes): fuso America/Sao_Paulo (incluindo horário de verão histórico), recorrência, exceções, conflitos, ICS (escape e dobra de linhas), transições, atraso, conclusão, períodos, indicadores N/A, backlog sem datas inventadas, assinatura de arquivos.

Defeitos encontrados e corrigidos pelos testes: políticas de SELECT de `people`, `documents` e `programs` quebravam `INSERT … RETURNING`; regex de URL incompatível com o PostgreSQL; ordem de argumentos no gerador de tipos; configuração do Tailwind perdida ao editar `next.config.ts`.

## 3. Limitações e pendências desta etapa

1. **Ambiente de testes**: as imagens Docker do Supabase não puderam ser baixadas e a execução de binários externos (GoTrue/PostgREST) foi bloqueada pela política do ambiente. Por isso:
   - RLS e regras foram testados num PostgreSQL 16 com *shims* de `auth`/`storage` (mesmo mecanismo de `auth.uid()` e papéis do Supabase);
   - os tipos do banco foram gerados por `scripts/gen-types.mjs` (mesmo formato do `supabase gen types`);
   - os 10 cenários E2E autenticados (`tests/e2e/escopo.spec.ts`) e o upload real ao Storage **não foram executados**. Rodar com `supabase start` + seeds e `E2E_AUTH=1` antes de homologar.
2. As telas internas foram verificadas por typecheck, build e testes, mas não inspecionadas visualmente com sessão autenticada (mesma causa).
3. Arrastar-e-soltar no kanban não foi implementado: a mudança de status passa pela página da ação, porque bloqueio/reabertura/conclusão podem exigir justificativa. Pode ser adicionado como atalho mantendo a validação.
4. Conflitos de agenda consideram pessoas e equipes; ambientes/recursos entram com RF09 (etapa 4).
5. Supervisão não cria vínculos de acesso (apenas a administração), para não ampliar quem concede papéis antes da política de acesso (PRD §14).
6. Ajustes obrigatórios no painel do Supabase (desabilitar cadastro público, templates de e-mail, primeiro administrador) estão no README.

## 4. Decisões que dependem da instituição (PRD §14)

Vínculo de orientadores/ocupações; alunos A/B e formato das equipes; jornada real e percentual; calendário oficial (datas do ciclo 2027); rubricas e escalas oficiais; frequência de simulados; disponibilidade de ambientes; orçamento; vínculo/bolsa/alimentação; NAPI; titularidade, base legal, retenção e segurança dos dados (LGPD); política de acesso; autorização de infraestrutura em nuvem.

## 5. Próximos passos

1. Rodar o Supabase local, executar os E2E autenticados e uma revisão visual das telas internas; aplicar em um projeto Supabase **de desenvolvimento**.
2. Validar com a supervisão: modelo de papéis/escopos, regra de conclusão de ações e uso dos checklists.
3. **Etapa 2 — WorldSkills**: alocações (jornada e percentual por vigência), competências, plano versionado, sessões e presença, simulados e erros/causa raiz, rampas, fechamento semanal (RF06/RF07) e indicadores de CH com denominador explícito.
