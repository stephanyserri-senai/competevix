# Etapa 3 — INOVA SENAI · Relatório

Data: 25/11/2026 · Referência: PRD v0.1 §4, §7, §8, §12 (item 3), RF08

## 1. Funcionalidades implementadas

| Área | Onde | Entrega |
|---|---|---|
| Ficha de projeto | INOVA → Projetos | Problema, solução, empresa parceira, diferencial técnico, proposta de valor, modelo de negócio; arquivamento |
| Funil | INOVA → Projetos e funil | Prospecção → seleção → anterioridade → validação do problema → protótipo → validação técnica/financeira → banca/pitch → prioritário (quadro por etapa) |
| Evidências | Página do projeto | Por tipo (comparação de mercado, diferencial técnico, validação industrial, testes de produtividade/custo/qualidade, viabilidade, modelo de negócio, anterioridade, protótipo funcional), com texto, link ou documento privado; ficam registradas na etapa em que foram anexadas |
| Revisão de etapa | Página do projeto (supervisão) | Avanço só para a etapa seguinte e com evidência na etapa atual; “prioritário” exige banca publicada; retorno exige justificativa; histórico gravado pelo banco |
| Rubricas | INOVA → Rubricas | Versionadas (rascunho → publicada → substituída), dois níveis (grupo e critério), grupo deve somar os critérios; rubrica oficial × interna |
| Rubrica preliminar | criada automaticamente | Inovação 40 (8 critérios de 0–5), pitch 30, proposta de valor 20, viabilidade/mercado 10 — marcada como **interna / não oficial** |
| Bancas | INOVA → Bancas / página da banca | Projeto + rubrica publicada; designação de avaliadores; publicação; revisão por nova versão |
| Avaliadores | Minhas bancas | Vínculo temporário “avaliador” (com fim); veem só a banca e o projeto atribuídos; avaliação independente (sem ver notas alheias); salvar rascunho e enviar |
| Resultado | Banca e lista de bancas | Média das avaliações completas, sem arredondar antes da classificação; faixas ≥95 excelente, 90–<95 muito bom, 80–<90 intermediário, 70–<80 baixo, <70 insuficiente; metas 95/100 e 38/40 em inovação |
| Indicadores | INOVA → Projetos e funil | Projetos por etapa; com protótipo funcional; % de prioritários com validação empresarial (meta 100%) |
| Ciclo | banco | “2027” renomeado para **2027–2028** (mesmos programas) |

## 2. Critérios de aceite (PRD §12) e testes

| Critério | Como é garantido | Teste |
|---|---|---|
| Impedir notas fora do limite | gatilho por critério (0 ≤ nota ≤ máximo) e bloqueio de nota em grupo | `tests/db/inova.test.ts` |
| Impedir publicação incompleta | avaliador só envia com todos os critérios; banca só publica sem pendências | idem |
| Impedir avanço sem evidência | `advance_project_stage` exige evidência da etapa atual, sem saltos, revisão da supervisão | idem |
| Manter histórico | histórico de etapas não gravável pelo cliente; rubrica e banca publicadas imutáveis; revisão = nova versão | idem |
| Avaliador restrito à banca | RLS por designação + vínculo vigente; revogação encerra acesso | idem |
| Média sem arredondar | domínio `panelResult` (94,75 não vira 95) | `tests/unit/inova.test.ts` |

| Verificação | Resultado |
|---|---|
| lint / typecheck | sem erros |
| Testes unitários + banco | **98/98** (10 novos de banco, 4 de domínio) |
| build | concluído |
| E2E públicos | **28/28** |
| SQL `atualizacao_etapa3.sql` | validado sobre Etapas 1+2 e em instalação nova; reexecução recusada |

Corrigido nesta rodada: um teste de alertas usava a data UTC do servidor e falhava entre 21h e 0h de Brasília (o sistema usa corretamente o fuso de São Paulo).

## 3. Pendências e limitações

1. **Rubrica oficial:** o regulamento oficial do INOVA ainda não foi recebido. A rubrica preliminar serve de referência interna; publique a oficial como nova rubrica marcada “oficial” quando houver validação.
2. **Documentos para avaliadores:** avaliadores veem a descrição e o link das evidências, mas não baixam documentos privados do projeto. Para liberar, é preciso decidir a política de acesso (PRD §14).
3. **Calendário e meta de seleção:** o calendário de referência (fev–nov) e a regra “10 iniciais → 3 prioritários por escola” aparecem apenas como texto, sem regra automática, até serem confirmados.
4. **Alerta de banca mensal ausente:** depende da cadência oficial.

## 4. Como aplicar no Supabase

Cole `supabase/instalacao/atualizacao_etapa3.sql` (Raw no GitHub) no SQL Editor e clique em **Run** uma vez. Depois, `diagnostico.sql` deve mostrar a coluna `etapa3_inova` = **true**.

Para usar:
1. Cadastre equipes no programa INOVA e crie os projetos.
2. Para cada avaliador, crie um vínculo **avaliador** com data de fim, pela importação em massa ou em Configurações.
3. Crie a banca e designe os avaliadores.
