# Etapa 2 — WorldSkills e acompanhamento semanal · Relatório

Data: 25/11/2026 · Referência: PRD v0.1 §6, §9, §12 (item 2), RF06 e RF07

## 1. Funcionalidades implementadas

| Área | Onde | Entrega |
|---|---|---|
| Importação em massa | Configurações → Importar usuários | CSV (`email; nome; papel; unidade; competicao; ciclo; inicio; fim`), validação completa antes de gravar, link de primeiro acesso (sem depender de SMTP) ou convite por e-mail, vínculo de acesso e cadastro de pessoa para orientadores/competidores |
| Alocações | WorldSkills → Alocações | Jornada semanal × percentual por pessoa, equipe e vigência (sem fixar 25h); sobreposição bloqueada; pessoa em duas equipes = duas alocações |
| Competências | WorldSkills → Competências | Por ocupação; peso só com fonte declarada |
| Plano de treinamento | WorldSkills → Planos | Itens com competência, objetivo, atividade, minutos, responsável, recurso, evidência, critério de aceite e prazo; rascunho → publicado; conteúdo publicado imutável; nova versão exige motivo e substitui a anterior; execução por item (cancelamento exige justificativa) |
| Sessões e presença | WorldSkills → Sessões | Duração efetiva (intervalo − pausas); presença individual (presente, parcial, ausente, justificada), única por pessoa e sessão, limitada à duração efetiva |
| Simulados | WorldSkills → Simulados | Tipo, versão da prova e dos critérios, escala e máximo, tempo de prova; notas da equipe, individuais ou por critério; publicação congela as notas; análise de erros com causa raiz e ação corretiva |
| Rampa | WorldSkills → Rampa | Meta mensal por ocupação e escala, com situação (proposta/aprovada) e fonte obrigatória |
| Indicadores | WorldSkills → Visão geral; Painel | CH semanal por equipe e por pessoa (meta ≥ 95%), execução do plano na semana e no mês, último simulado comparável, desvio vs. rampa e distância da meta final |
| RF06 Fechamento semanal | Acompanhamentos | Por equipe e semana (segunda a domingo), horas sugeridas pela CH, resultados, dificuldades, intervenção e próximas entregas; rascunho → enviado → em revisão → aprovado/devolvido; devolução exige orientação; correção após aprovação gera nova versão |
| Alertas | rotina diária | Fechamento semanal não enviado; simulado abaixo da rampa (mesma escala) |

### Regras de cálculo (PRD §9)

- **CH** = minutos efetivos ÷ minutos previstos × 100; previsto zero = N/A.
  - **Previsto:** alocações vigentes rateadas por dia útil (seg–sex) do calendário real, não por "4 semanas".
  - **Efetivo:** presença individual nas sessões do período. As horas do orientador contam uma vez por sessão, sem multiplicar pelo número de alunos.
  - **Ausência:** reduz o efetivo.
  - **Equipe dupla:** na CH por equipe, entram só as alocações e sessões da própria equipe; na CH por pessoa, tudo é somado sem duplicar.
- **Execução** = itens concluídos ÷ itens com prazo no período. Itens cancelados saem do denominador.
- **Desvio** = nota comparável − meta.
  - Só é calculado com a mesma ocupação e a mesma escala; caso contrário, aparece N/A.
  - Nota bruta não é convertida para a escala WorldSkills.

## 2. Testes realizados

| Verificação | Resultado |
|---|---|
| `npm run lint` / `npm run typecheck` | sem erros |
| Testes unitários + banco | **84/84** (13 novos de banco, 5 de domínio da CH, 3 de importação) |
| `npm run build` | concluído |
| E2E públicos | **24/24** (inclui as novas rotas protegidas) |
| SQL de atualização | validado sobre a instalação da Etapa 1 e em instalação nova; reexecução é recusada com mensagem |

Os critérios de aceite da Etapa 2 estão cobertos em `tests/unit/worldskills.test.ts`: jornada variável e vigência parcial, ausência, equipe dupla, horas do orientador e comparação apenas entre escalas equivalentes.

## 3. Pendências e limitações

1. **Feriados:** não são descontados do previsto, porque o calendário oficial ainda está pendente (PRD §14).
2. **Alerta de CH abaixo da meta:** a CH aparece no painel da equipe, mas o alerta automático ainda não foi implementado.
3. **Alerta de simulado ausente:** depende da cadência oficial (parcial semanal / completo mensal / sexta-feira), ainda a confirmar.
4. **Lançamento pelo competidor:** o PRD permite que o competidor registre atividades próprias "quando habilitado". Não foi implementado: o competidor só consulta, e o lançamento fica com orientação e supervisão.
5. **Links de primeiro acesso:** usam a validade de link configurada no Supabase (Authentication → Emails/OTP expiry).
6. **E2E autenticados:** continuam dependendo de um Supabase com dados de teste (ver Etapa 1).

## 4. Como aplicar no Supabase já instalado

Abra `supabase/instalacao/atualizacao_etapa2.sql` (botão **Raw** no GitHub), copie, cole no **SQL Editor** e clique em **Run** uma vez. Depois rode `diagnostico.sql`: a nova coluna `etapa2_worldskills` deve vir **true**.

## 5. Próximos passos

1. Cadastrar alocações, competências e o primeiro plano após a reunião com os orientadores (30/11–04/12).
2. Validar a cadência de simulados e os pontos da rampa.
3. Etapa 3 — INOVA (RF08): projetos, funil com evidências, rubricas versionadas e bancas.
