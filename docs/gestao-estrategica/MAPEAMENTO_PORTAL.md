# Mapeamento: estrutura documental × portal COMPETE VIX

Os documentos desta pasta são **modelos preliminares** (ciclo 2027–2028). O portal é a fonte
operacional (PRD §1). Esta tabela indica onde cada informação passa a ser registrada.

| Documento | Módulo do portal | Etapa |
|---|---|---|
| DOC-01 Plano diretor | Competições/programas (`/competicoes`), Configurações | 1 (estrutura) |
| DOC-02 Cronograma mestre | Etapas do programa e Agenda (`/agenda`, exportação ICS) | 1 |
| DOC-03 Matriz de responsabilidades | Vínculos de acesso (Configurações) e equipes; alocação de CH | 1 / 2 |
| WS-00 Planejamento geral | Equipes (`/equipes`), alocações e cadência | 1 / 2 |
| DOC-04 Plano de treinamento (#33, #48, #50) | WorldSkills: competências, plano versionado, sessões, simulados (`/worldskills`) | 2 |
| DOC-05 Ficha individual | WorldSkills: presença, desempenho e plano de melhoria por pessoa | 2 |
| INOVA-00 Planejamento geral | Programa INOVA, agenda e ações | 1 / 3 |
| DOC-06 Matriz de avaliação de projetos | INOVA: rubricas versionadas e bancas (`/inova`) | 3 |
| DOC-07 Funil de seleção e maturidade | INOVA: funil com evidências e ficha de projeto | 3 |
| DOC-08 Plano orçamentário consolidado | Recursos e Orçamento (`/recursos`, `/orcamento`) | 4 |
| DOC-09 Matriz de riscos | Riscos (`/riscos`) | 4 |
| DOC-10 Dashboard gerencial | Painel (`/dashboard`) — dicionário de indicadores com fórmula, fonte e periodicidade | 1 (parcial) / 2–4 |
| DOC-11 Reporte mensal | Relatórios (`/relatorios`) | 4 |
| REG-01 Registro de ações | Ações (`/acoes`) — backlog de 24/11 importável | 1 |
| REU-02 Modelo de ata | Ações (origem = reunião) e Documentos; módulo de atas a avaliar | 1 (parcial) |
| BEN-01 Registro de benchmarking | Benchmarking (`/benchmarking`) | 4 |
| DOC-12 Hansei | Benchmarking/lições aprendidas e Ações (contramedidas) | 4 |

Observações:

- O seed de referências usa o ciclo `2027`; a estrutura documental fala em ciclo **2027–2028**.
  Confirmar a nomenclatura e as datas oficiais antes de ajustar o cadastro (PRD §14).
- Não registrar dados pessoais nestes arquivos versionados no Git; dados de pessoas ficam no portal, sob RLS.
