# Etapa 3 — INOVA SENAI · Relatório

> **Ajuste de 25/11/2026 (decisão da supervisão):** no INOVA o portal **não** gerencia bancas nem avaliadores. A avaliação oficial acontece no evento. A rubrica é usada em **simulações internas** (orientação e supervisão pontuam o próprio projeto para preparar o pitch), e os **resultados obtidos no evento** são registrados em cada projeto. “Minhas bancas” saiu do menu, e priorizar um projeto não exige mais banca. O mecanismo de avaliador com acesso restrito continua no banco, sem uso na interface.

Data: 25/11/2026 · Referência: PRD v0.1 §4, §7, §8, §12 (item 3), RF08

## 1. Funcionalidades implementadas

| Área | Onde | Entrega |
|---|---|---|
| Ficha de projeto | INOVA → Projetos | Problema, solução, empresa parceira, diferencial técnico, proposta de valor, modelo de negócio; arquivamento |
| Funil | INOVA → Projetos e funil | Prospecção → seleção → anterioridade → validação do problema → protótipo → validação técnica/financeira → banca/pitch → prioritário (quadro por etapa) |
| Evidências | Página do projeto | Por tipo (comparação de mercado, diferencial técnico, validação industrial, testes de produtividade/custo/qualidade, viabilidade, modelo de negócio, anterioridade, protótipo funcional), com texto, link ou documento privado; ficam registradas na etapa em que foram anexadas |
| Revisão de etapa | Página do projeto (supervisão) | Avanço só para a etapa seguinte e com evidência na etapa atual; retorno exige justificativa; histórico gravado pelo banco |
| Rubricas | INOVA → Rubricas | Versionadas (rascunho → publicada → substituída), dois níveis (grupo e critério), grupo deve somar os critérios; rubrica oficial × interna |
| Rubrica preliminar | criada automaticamente | Inovação 40 (8 critérios de 0–5), pitch 30, proposta de valor 20, viabilidade/mercado 10 — marcada como **interna / não oficial** |
| Simulação interna | INOVA → Simulação interna | Quem cria já pontua o projeto com a rubrica publicada; pode incluir outra pessoa da supervisão/orientação; concluir; refazer por nova versão |
| Resultados no evento | Página do projeto | Etapa (estadual, regional, nacional), data, nota 0–100, inovação 0–40, colocação e feedback da banca oficial; indicador no funil frente às metas 2027 |
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

Rode `diagnostico.sql` e veja a coluna `etapa3_inova`:
- **false** → cole `supabase/instalacao/atualizacao_etapa3.sql` (já inclui o ajuste);
- **true** → cole apenas `supabase/instalacao/atualizacao_etapa3_ajuste.sql`.

No fim, `etapa3_ajuste_resultados` deve ser **true**.
