# Etapa 4.2 — Workflow de ações, BI no painel e portal simplificado

## O que mudou
- **Workflow com validação:** A fazer → Em andamento → Em validação → Concluída. Só a supervisão aprova (conclui) ou devolve (com motivo). Cancelar exige motivo.
- **Bloqueio vira sinal** no cartão (com motivo), sem tirar a ação da etapa. Ações antigas com status “bloqueada” foram convertidas para “Em andamento + bloqueada”.
- **Tema da ação:** treino, infraestrutura, compras, pessoas, eventos, gestão, outro.
- **Quadro de ações** (arrastar e soltar ou botões), visão em lista, filtros por frente, responsável, tema, “Minhas” e “Atrasadas”, criação rápida em janela lateral.
- **Painel = BI de ações:** indicadores (em aberto, concluídas no período, % no prazo, atrasadas, em validação, bloqueadas), gráficos por frente, evolução semanal (criadas × concluídas), por tema, tabela por responsável e lista “Precisa de atenção”. Todos os gráficos têm legenda, dica ao passar o mouse e “Ver em tabela”.
- **Menu enxuto:** Painel, Ações, Agenda, Equipes; demais módulos em “Mais módulos”; Configurações no rodapé. Visual renovado.
- **Standby:** FRC, Giaffone e E-Kart marcadas como inativas (“Em standby”), fora da criação de programas. Nada foi apagado.

## Regras do indicador “No prazo”
Concluídas no período com data de conclusão ≤ prazo ÷ concluídas no período que tinham prazo. Sem base, mostra “Sem dados”.

## Banco
- Migração: `supabase/migrations/20261129000100_workflow_acoes.sql`.
- Para quem já tem a 4.1: colar `supabase/instalacao/atualizacao_etapa4_2.sql` no SQL Editor (protegido contra execução dupla). Conferir com `diagnostico.sql` (coluna `etapa4_2_workflow`).
- Instalação nova: `instalacao_completa.sql` já inclui tudo.

## Testes
130 testes (unitários + banco, incluindo 6 do workflow), lint, typecheck, build e 34 E2E públicos passando.

## Pendente
- Teste autenticado pela usuária (quadro, aprovação, painel com dados reais).
- Retomar FRC/Giaffone/E-Kart após o levantamento (`docs/LEVANTAMENTO_ETAPA_5.md`): basta reativá-las.
