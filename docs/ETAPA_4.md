# Etapa 4 — Recursos, orçamento, benchmarking, riscos e relatórios · Relatório

Data: 25/11/2026 · Referência: PRD v0.1 §8, §9, §12 (item 4), RF09–RF14

## 1. Funcionalidades implementadas

| Área | Onde | Entrega |
|---|---|---|
| RF09 Inventário | Recursos → Inventário e ambientes | Itens por unidade (compartilhados entre programas): tipo, patrimônio, quantidade, condição, local, disponibilidade; ambientes “reserváveis” |
| RF09 Solicitações | Recursos → Solicitações | Rascunho → enviada → em análise → aprovada/rejeitada → atendida/cancelada; decisor e data registrados; trâmite completo; “necessidade a analisar” (ex.: Smart 4.0); “bloqueante” gera alerta |
| RF09 Movimentações | Recursos → Movimentações | Origem, destino, quantidade, data e referência da aprovação institucional |
| Ambientes na agenda | Agenda | Evento pode reservar um ambiente da unidade; conflito de ambiente detectado junto com pessoa e equipe |
| RF10 Orçamento | Orçamento | Itens por categoria com estimado; lançamentos solicitado/aprovado/comprometido/realizado com referência; realizado pode consumir um compromisso; cancelamento lógico justificado; saldo por item e total com conferência automática (“saldo reconciliado”) |
| RF11 Benchmarking | Benchmarking | Referência, contato, objetivo, data, situação, achados (obrigatórios para “realizado”) e ações derivadas criadas no módulo de Ações |
| RF12 Riscos | Riscos | Probabilidade e impacto 1–5, pontuação calculada, matriz 5×5, mitigação, responsável, prazo, próxima revisão; reavaliação com comentário e histórico; fechar exige mitigação |
| RF14 Relatórios | Relatórios | Relatório semanal/mensal com data de corte, seções por módulo e metodologia; impressão/PDF; CSV de ações, CH, simulados, fechamentos, riscos, solicitações e orçamento |
| RF13 Documentos | Documentos | Nova versão a partir do documento mais recente (versão anterior marcada como substituída) |
| Alertas | rotina diária | Recurso bloqueante pendente; risco crítico (≥15) com revisão vencida |

## 2. Critérios de aceite (PRD §12) e testes

| Critério | Como é garantido | Teste |
|---|---|---|
| Saldo reconciliado | Visão `budget_item_summary` no banco e `summarize()` no domínio aplicam a mesma regra; a tela compara as duas e sinaliza divergência | `tests/db/etapa4.test.ts`, `tests/unit/etapa4.test.ts` |
| Sem dupla contagem | Realizado vinculado consome o compromisso; acima do compromisso é recusado; lançamentos imutáveis; cancelados fora das somas | `tests/db/etapa4.test.ts` |
| Exportação respeita permissões | CSV e relatório consultam com a sessão do usuário (RLS); orçamento só para supervisão/gestão | RLS testado em `etapa4.test.ts` |
| Indicadores reproduzíveis | Relatório traz período, data de corte, autor, metodologia e CSV com os dados brutos | — |

| Verificação | Resultado |
|---|---|
| lint / typecheck | sem erros |
| Testes unitários + banco | **115/115** (9 novos de banco, 6 de domínio) |
| build | concluído |
| E2E públicos | **34/34** (rotas novas protegidas) |
| `atualizacao_etapa4.sql` | validado sobre o estado atual (Etapas 1–3 + ajuste) e em instalação nova; reexecução recusada |

## 3. Pendências e limitações

1. **Comprovantes de orçamento:** são enviados em Documentos (classificação restrita) e citados pela referência no lançamento. O vínculo direto por arquivo já existe no banco (`document_id`), mas ainda não aparece na tela.
2. **Relatório e situação histórica:** o relatório mostra a situação atual das ações. A data de corte vale para atrasos, períodos e orçamento, mas não reconstrói o status histórico das ações (está declarado na metodologia).
3. **Calendário oficial:** feriados e cadências continuam pendentes. As opções estão na mensagem enviada à supervisão.
4. **Etapa 5:** FRC, Giaffone e E-Kart específicos, integrações e IA dependem de levantamento e governança (PRD §12, item 5).

## 4. Como aplicar no Supabase

Cole `supabase/instalacao/atualizacao_etapa4.sql` (Raw no GitHub) no SQL Editor e clique em **Run** uma vez. O `diagnostico.sql` deve então mostrar a última coluna `etapa4_gestao` = **true**.

---

## Etapa 4.1 — Calendário, cadências e comprovantes (25/11/2026)

| Entrega | Onde | Detalhe |
|---|---|---|
| Calendário de dias não úteis | Configurações → Calendário | Feriados e recessos globais (administração) ou por unidade (supervisão); “descontar da CH”; carga automática dos feriados nacionais do ano (datas fixas + Paixão de Cristo) |
| CH com calendário | WorldSkills, Acompanhamentos, Relatórios, CSV | O previsto exclui os dias marcados; o cálculo do banco (`private.team_ch`) e o do domínio são idênticos (teste de paridade) |
| Cadências por programa | Competições → programa → Parâmetros | Simulado parcial (semanal/quinzenal), completo (mensal/semanal), avaliação externa (trimestral), prazo do fechamento semanal, alerta de CH < 95% |
| Alertas | rotina diária | CH abaixo da meta e simulado ausente **só disparam depois de configurados**, e só para equipes com plano publicado no período; resolvem sozinhos quando corrigidos |
| Comprovante | Orçamento | Lançamento pode vincular um documento do programa; link exibido na lista |
| Etapa 5 | `docs/LEVANTAMENTO_ETAPA_5.md` | Roteiro de levantamento para FRC, Giaffone, E-Kart, integrações e IA |

Verificação: **120/120** testes (banco + unidade), lint e typecheck sem erros, build ok, **34/34** E2E públicos. Aplicar com `supabase/instalacao/atualizacao_etapa4_1.sql`; o diagnóstico deve mostrar `etapa4_1_calendario` = **true**.
