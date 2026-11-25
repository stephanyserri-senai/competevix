# COMPETE VIX — Product Requirements Document
**Versão 0.1 | 24/11/2026 | SENAI Vitória — Beira-Mar e Porto**

## 1. Propósito e fontes
Portal de gestão integrada das competições, sob supervisão de Stephany. Base: três infográficos da gestão e anotações da reunião de 24/11/2026. Nome, arquitetura e regras operacionais deste PRD são propostas, não aprovações institucionais. Não tratar referências de pontuação como regulamento oficial sem validação.

## 2. Escopo e resultados esperados
WorldSkills e INOVA SENAI são prioridades. FRC, Giaffone e E-Kart devem ser cadastráveis, inicialmente com módulos comuns. Suportar múltiplas unidades, ciclos, etapas e equipes sem alterações de código. Centralizar agenda mensal, planejamento semanal, checklists, recursos, decisões, indicadores e evidências. Não implementar IA, folha de pagamento ou compras efetivas no MVP.

## 3. Arquitetura proposta
Next.js App Router + TypeScript strict + Tailwind CSS + componentes acessíveis; Supabase PostgreSQL, Auth e Storage privado; Vercel; GitHub; Recharts. Validação Zod no servidor e cliente. Migrations SQL versionadas, tipos gerados do banco, testes Vitest e Playwright. Separar domínio, serviços, acesso a dados e UI. Datas em UTC no banco e America/Sao_Paulo na apresentação. Interface pt-BR, responsiva, azul institucional e laranja, contraste adequado, estados de carregamento, vazio e erro. Não inventar logotipos oficiais.

## 4. Perfis e autorização
- Administrador: provisionamento de usuários e configurações, sem acesso automático a dados sensíveis.
- Supervisão: gestão das frentes autorizadas, aprovações, indicadores e relatórios.
- Orientador: editar planejamento, atividades, avaliações e solicitações das equipes atribuídas; consultar histórico correspondente.
- Competidor: consultar seu plano e desempenho, registrar atividades próprias quando habilitado.
- Gestão: leitura consolidada das unidades autorizadas; decisões orçamentárias conforme delegação.
- Avaliador: acesso temporário exclusivamente à banca atribuída.
- NAPI: fora do MVP clínico; registrar somente encaminhamento administrativo restrito, sem diagnóstico ou prontuário.
Aplicar RLS por vínculo ativo, unidade, ciclo e equipe; negar por padrão. Não confiar em filtros da interface nem em papel enviado pelo cliente. Convites sem cadastro público; revogação imediata. Testar acesso cruzado e URLs de arquivos. Aprovação financeira no portal é registro interno, não substitui autorização institucional.

## 5. Navegação e requisitos funcionais
| ID | Rota | Requisito e aceite |
|---|---|---|
| RF01 | /dashboard | Filtrar ciclo/unidade/competição; mostrar metas, desvios, pendências, próximos eventos e origem dos dados; ausência de registro = sem dados, não zero. |
| RF02 | /competicoes | CRUD de competição, ciclo, etapa, ocupação e projeto; arquivar sem apagar histórico. |
| RF03 | /equipes | Vincular alunos, orientadores titulares/reservas e suplentes com vigência; permitir equipes de múltiplos competidores. |
| RF04 | /agenda | Visões mensal/semanal, eventos recorrentes, responsáveis, conflitos de horário e exportação ICS; exceções editáveis. |
| RF05 | /acoes | Kanban e tabela com responsável, prazo, prioridade, dependências, evidências e histórico; conclusão exige justificativa/evidência quando configurado. |
| RF06 | /acompanhamentos | Planejamento e fechamento semanal por equipe, horas, resultados, dificuldades, intervenção e próximas entregas; supervisão revisa e devolve. |
| RF07 | /worldskills | Plano por competência, sessões, presença, simulados, erros, causa raiz, plano de melhoria e rampa configurável. |
| RF08 | /inova | Ficha de projeto, funil, evidências, validação industrial, protótipo, modelo de negócio e bancas versionadas. |
| RF09 | /recursos | Inventário, ambientes, insumos, disponibilidade, solicitações e movimentações; registrar Smart 4.0 como necessidade a analisar. |
| RF10 | /orcamento | Estimado, solicitado, aprovado, comprometido e realizado por item; anexar comprovação; evitar dupla contagem. |
| RF11 | /benchmarking | Referência, contato, objetivo, agenda, achados e ações derivadas. |
| RF12 | /riscos | Probabilidade e impacto 1–5, mitigação, responsável, prazo e revisão. |
| RF13 | /documentos | Upload privado, classificação, versão, vínculo e download autorizado. |
| RF14 | /relatorios | Exportar CSV e relatório imprimível semanal/mensal, com filtros, data de corte e metodologia. |
| RF15 | /configuracoes | Gerenciar perfis, permissões, metas, cadências, rubricas e parâmetros; auditar mudanças. |

## 6. WorldSkills — regras específicas
| Ocupação | Unidade | Meta | Base 2026 | Benchmarking reunião |
|---|---|---:|---|---|
| #33 Tecnologia Automotiva | Beira-Mar | 760 | ouro + bronze | PR |
| #48 Indústria 4.0 | Beira-Mar | 750 | 2 ouros | MG |
| #50 Arte Digital 3D | Porto | 770 | ouro + prata + bronze | SP |
Referências internacionais ouro/prata/bronze/Brasil: #33 759/730/727/722; #48 747/742/740/740; #50 765/740/734/723. Fonte: infográfico; validar edição e comparabilidade.
Competidores: previsão de seis, composição A/B e formato de equipe a confirmar. Orientadores citados: Pardinho, André e Aminta, sem atribuir ocupações antes da reunião. Competidor 8h/dia no infográfico; orientador 5h/dia versus 50% da jornada na reunião. Parametrizar jornada e percentual por pessoa e vigência, sem fixar 25h. Mensal de 160h/100h é referência de quatro semanas, não calendário real.
Competências iniciais: #33 diagnóstico, elétrica/eletrônica, motores, transmissão, freios/direção/suspensão, eletromobilidade e falhas; #48 automação, CLP, integração, redes, IIoT, digital twin, dados e falhas; #50 modelagem, escultura, texturização, UV, iluminação/renderização, animação, motores gráficos e otimização. Validar documentos técnicos oficiais antes de definir pesos.
Plano: competência, objetivo, atividade, horas, responsável, recurso, evidência, critério de aceite. Sessões registram duração efetiva e presença individual. Simulados: tipo, versão, critérios, nota bruta, escala, duração, erros e revisão. Não converter nota bruta em escala WorldSkills sem metodologia validada. Rampa mensal cadastrável; pontos intermediários ainda não aprovados. Simulado parcial semanal e completo mensal como referência; sexta-feira no infográfico também indica completo, confirmar cadência.
Indicadores: CH >=95%; execução do plano 100%; parcial semanal; completo mensal; externo trimestral; pontuação conforme rampa; tempo de prova 100%; análise de erros 100%; acidentes zero. Registrar denominador, período e fonte.

## 7. INOVA — regras específicas
Base 2026: Digital Twin Beira-Mar 5º estadual; Plantas que Falam São Mateus 2º nacional. Metas 2027: 1º estadual, top 3 nacional, >=95/100 e >=38/40 inovação. Benchmarking São Mateus e situação dos alunos para nacional com Renisson.
Rubrica preliminar: inovação 40, pitch 30, proposta de valor 20, viabilidade/mercado 10. Inovação: oito critérios de 0–5 (originalidade, diferencial competitivo, complexidade tecnológica, relevância do problema, impacto, maturidade tecnológica, escalabilidade/replicabilidade, barreiras à reprodução). Escala interna 1 reprodução, 2 adaptação, 3 incremental, 4 diferenciada, 5 alto impacto; zero proposto para ausência de evidência. Não confundir rubrica interna com oficial. Classificação: >=95 excelente; 90–<95 muito bom; 80–<90 intermediário; 70–<80 baixo; <70 insuficiente. Média de avaliadores com submissões completas, sem arredondamento antes da classificação; método proposto, configurável. Avaliação publicada imutável; revisão cria versão.
Funil proposto: prospecção → seleção → anterioridade → validação do problema → protótipo → validação técnica/financeira → banca/pitch → prioritário. Avanço exige evidências e revisão da supervisão. Evidências: comparação de mercado, diferencial técnico, validação industrial, testes de produtividade/custo/qualidade, viabilidade e modelo de negócio. Não exigir ganhos fictícios.
Calendário de referência: fev–mar diagnóstico; abr–mai benchmarking; jun estruturação (10 iniciais para 3 prioritários por escola, confirmar); jul–set desenvolvimento; out–nov performance. Indicadores: CH >=95%, evolução conforme rampa, bancas mensais, protótipos funcionais e validação empresarial de 100% dos prioritários.

## 8. Modelo relacional inicial
Todos os IDs UUID; created_at, updated_at, created_by quando aplicável. FKs explícitas, índices nas FKs e filtros, CHECK de valores não negativos, unique por escopo. Arquivamento lógico para registros históricos. Valores monetários numeric(14,2), duração em minutos inteiros. Campos de status com enums ou CHECK. Tabelas:
| Tabela | Campos principais / relações |
|---|---|
| units, competitions, cycles | name, code, active; cycles: start_date, end_date |
| programs | competition_id, cycle_id, unit_id, status; unique combinação |
| profiles, memberships | auth_user_id, display_name; memberships: user_id, program_id, role, valid_from/to |
| occupations | program_id, code, name, target_score |
| teams, team_members | program_id, occupation_id nullable, name; member: person_id, role, validity |
| people | nome, vínculo institucional, contato mínimo autorizado; user_id opcional |
| allocations | person_id, program_id, weekly_minutes, percent, valid_from/to |
| events, event_participants | program_id, team_id, start/end, type, recurrence, owner; participantes |
| actions, action_dependencies | program_id, team_id, title, owner_id, due_date, status, priority, completion_note; dependências sem ciclos |
| checklist_templates, checklist_items, checklist_runs, checklist_answers | versão, item obrigatório, escopo, período, resposta, evidência |
| weekly_reports | team_id, week_start, planned_minutes, actual_minutes, outcomes, blockers, next_steps, intervention, status; unique equipe/semana |
| competencies, training_plans, training_items | occupation_id, name, weight; team_id, version; competence_id, objective, planned_minutes, due_date |
| sessions, attendance | training_item_id, start/end, actual_minutes; person_id, attended_minutes |
| assessments, assessment_results, assessment_errors | team_id, type, rubric_version, date, scale, duration; person/team, score, criterion; error, cause, corrective_action |
| score_targets | program_id, occupation_id/project_id, period, metric, target, scale |
| projects, project_stage_history | team_id, problem, solution, partner, stage, value_proposition; from/to, reviewer, evidence |
| rubrics, rubric_versions, rubric_criteria | competition_id, version, parent_criterion_id, max_score, weight, description |
| panels, panel_assignments, panel_scores | project_id, rubric_version_id, date; evaluator_id, status; criterion_id, score, comment |
| resources, resource_requests, resource_movements | unit_id, type, quantity, condition; program_id, quantity, justification, status; origin/destination, approval |
| budget_items, budget_transactions | program_id, category, estimate; item_id, type, amount, date, approval_ref |
| benchmarks, risks | program_id, reference, objective, findings; probability, impact, mitigation, owner, status |
| documents, document_links | storage_path, version, classification, uploader; document_id, vínculo com entidade autorizado |
| notifications, audit_log | user_id, type, read_at, dedupe_key; actor, entity, operation, timestamp, diff minimizado |

Garantir integridade de escopo nas relações filhas (FK composta ou trigger), impedir referências a outra unidade/ciclo. Para vínculos de documentos, usar tabelas de associação com FK por tipo em vez de aceitar IDs arbitrários. Não persistir agregados sem necessidade; views com security_invoker ou RPC autorizada. Operações de publicação, aprovação e avanço de etapa em transação.

## 9. Fluxos e cálculos
- Ação: aberta → em andamento → bloqueada → concluída/cancelada; reabertura auditada. Atraso calculado por prazo e status, não status manual.
- Relatório semanal: rascunho → enviado → em revisão → aprovado/devolvido. Após aprovação, correção versionada.
- Solicitação: rascunho → enviada → análise → aprovada/rejeitada → atendida/cancelada. Registrar decisor e data.
- CH = minutos efetivos / minutos previstos × 100; denominador zero = N/A. Somar presença por pessoa sem duplicar sessões; horas de treinador não multiplicadas por alunos.
- Execução = itens concluídos / itens previstos no período × 100. Alterações do plano versionadas.
- Desvio de pontuação = nota comparável − meta do período. Sem simulado comparável, N/A.
- Pontuação INOVA = soma dos quatro grupos, respeitando máximos e versão; avaliações incompletas não entram na média.
- Orçamento: saldo aprovado menos compromissos ainda não realizados e realizados; transações vinculadas para evitar dupla contagem.
- Alertas: prazo vencido, relatório não enviado, CH abaixo da meta, simulado ausente, nota abaixo da rampa, recurso bloqueante. Gerar uma notificação por entidade/período/regra; resolver quando condição cessa. Cadência configurável; sem envio externo automático no MVP.

## 10. Segurança, privacidade e qualidade
LGPD: minimizar dados, definir base legal, retenção e responsáveis com instituição antes de produção; não usar dados reais em desenvolvimento. Storage privado com URLs assinadas de curta duração, validação MIME/tamanho, nomes aleatórios. Segredos apenas no servidor; nunca expor service role. RLS e políticas de storage testadas para cada papel. Logs sem informações sensíveis. Backup e restauração testados conforme plano contratado. Acessibilidade por teclado, labels, contraste, tabelas responsivas; meta proposta de carregamento p95 < 2,5 s em consultas comuns com volume de teste documentado. Paginação, filtros server-side e índices. Não publicar sem aprovação institucional de hospedagem e tratamento de dados.

## 11. Backlog inicial (fonte: reunião 24/11)
Cadastrar como ações abertas, responsáveis a definir, sem datas inventadas, salvo janela da reunião com orientadores (30/11–04/12/2026):
- Geral: agenda mensal, cadência/checklists semanais, estrutura/investimentos, tempo de orientadores.
- WS: reunião Pardinho/André/Aminta; alinhar 50% CH e períodos; plano com orientadores e suplentes; insumos/ferramentas; visita automotiva; movimentação Smart 4.0; estágio + bolsa; abertura de turma; benchmarking MG/SP/PR; alimentação; agenda NAPI; ativação de engajamento.
- INOVA: benchmarking São Mateus; verificar com Renisson alunos que sairão e quem irá ao nacional. Anotação “Lista” incompleta, esclarecer.

## 12. Implementação incremental e aceite
1. Fundação: scaffold, migrations, autenticação, RLS, unidades/ciclos/programas, equipe, agenda, ações, checklists, dashboard. Aceite: dois usuários de escopos diferentes não acessam dados cruzados; CRUD e filtros persistem; seed apenas referências identificadas.
2. WorldSkills: alocação, plano, sessões, presença, simulados, rampas, fechamento semanal. Aceite: calcular CH corretamente com jornada variável, ausência e equipe dupla; comparar apenas escalas equivalentes.
3. INOVA: projetos, etapas, rubricas, bancas e evidências. Aceite: impedir notas fora do limite, publicação incompleta e avanço sem evidência; manter histórico.
4. Recursos, orçamento, benchmarking, riscos e relatórios. Aceite: saldo reconciliado, exportação respeita permissões, indicadores reproduzíveis.
5. Expansão FRC/Giaffone/E-Kart e integrações, após levantamento específico. IA opcional somente com governança aprovada.

## 13. Instruções ao agente de código
Antes de alterar arquivos, inspecione repositório existente e apresente plano de implementação. Se vazio, inicialize projeto. Criar README, .env.example sem segredos, supabase/migrations, seed de demonstração separado, src/app, src/components, src/lib, src/features, tests. Implementar fase 1 primeiro, sem telas falsas apresentadas como funcionais. Usar dados reais apenas após autorização. Executar lint, typecheck, testes e build; registrar comandos, resultados, limitações e próximos passos. Não executar migrations destrutivas nem deploy de produção sem autorização. Entregar instruções de setup local e configuração Supabase/Vercel. Para cada fase, documentar critérios de aceite e pendências.

## 14. Decisões pendentes
Vínculo de orientadores/ocupações, alunos A/B e equipes, jornada real e período, calendário oficial, rubricas oficiais, escalas de pontuação, frequência de simulados, disponibilidade de ambientes, orçamento, vínculo/bolsa/alimentação, NAPI, titularidade e segurança dos dados, política de acesso, autorização de infraestrutura cloud. Validar com supervisão e gestão; não preencher lacunas com dados fictícios.
