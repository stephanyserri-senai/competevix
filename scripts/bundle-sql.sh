#!/usr/bin/env bash
# Gera os arquivos para colar no SQL Editor do Supabase (sem terminal/CLI):
#  - supabase/instalacao/instalacao_completa.sql : projeto NOVO (todas as migrations + referências)
#  - supabase/instalacao/atualizacao_etapaN.sql  : projeto JÁ instalado (só as migrations da etapa)
# Cada arquivo roda numa única transação. Uso: scripts/bundle-sql.sh
set -euo pipefail
cd "$(dirname "$0")/.."
dir=supabase/instalacao
header() {
  echo "-- ============================================================================="
  echo "-- COMPETE VIX — $1 (gerado por scripts/bundle-sql.sh)"
  echo "-- $2"
  echo "-- Tudo roda numa transação: se algo falhar, nada é aplicado."
  echo "-- ============================================================================="
}
{
  header "INSTALAÇÃO COMPLETA DO BANCO" "Execute UMA ÚNICA VEZ, num projeto Supabase NOVO. Inclui as referências do PRD (sem dados de demonstração)."
  echo "begin;"
  for f in supabase/migrations/*.sql supabase/seed/references.sql; do echo; echo "-- >>>>> $f"; cat "$f"; done
  echo; echo "commit;"
} > "$dir/instalacao_completa.sql"
echo "Gerado: $dir/instalacao_completa.sql"

# Etapa 2 = migrations a partir de 20261125
{
  header "ATUALIZAÇÃO — ETAPA 2 (WorldSkills e acompanhamento semanal)" "Execute UMA ÚNICA VEZ num banco que já recebeu a instalação da Etapa 1."
  echo "begin;"
  echo "do \$\$ begin"
  echo "  if to_regclass('public.units') is null then raise exception 'Instale primeiro a Etapa 1 (instalacao_completa.sql).'; end if;"
  echo "  if to_regclass('public.training_plans') is not null then raise exception 'Etapa 2 já instalada: nada a fazer.'; end if;"
  echo "end \$\$;"
  for f in supabase/migrations/20261125*.sql; do echo; echo "-- >>>>> $f"; cat "$f"; done
  echo; echo "commit;"
} > "$dir/atualizacao_etapa2.sql"
echo "Gerado: $dir/atualizacao_etapa2.sql"

# Etapa 3 = migrations a partir de 20261126 (inclui renomear ciclo para 2027–2028)
{
  header "ATUALIZAÇÃO — ETAPA 3 (INOVA SENAI) + ciclo 2027–2028" "Execute UMA ÚNICA VEZ num banco que já recebeu as Etapas 1 e 2."
  echo "begin;"
  echo "do \$\$ begin"
  echo "  if to_regclass('public.training_plans') is null then raise exception 'Instale primeiro a Etapa 2 (atualizacao_etapa2.sql).'; end if;"
  echo "  if to_regclass('public.projects') is not null then raise exception 'Etapa 3 já instalada: nada a fazer.'; end if;"
  echo "end \$\$;"
  for f in supabase/migrations/20261126*.sql; do echo; echo "-- >>>>> $f"; cat "$f"; done
  echo; echo "commit;"
} > "$dir/atualizacao_etapa3.sql"
echo "Gerado: $dir/atualizacao_etapa3.sql"

# Ajuste da Etapa 3 (INOVA sem bancas/avaliadores; resultado no evento) — para quem JÁ aplicou a Etapa 3
{
  header "AJUSTE — ETAPA 3 (INOVA: simulação interna e resultados no evento)" "Execute UMA ÚNICA VEZ somente se a Etapa 3 JÁ estiver instalada (diagnóstico: etapa3_inova = true)."
  echo "begin;"
  echo "do \$\$ begin"
  echo "  if to_regclass('public.projects') is null then raise exception 'Etapa 3 não instalada: use atualizacao_etapa3.sql (já contém este ajuste).'; end if;"
  echo "  if to_regclass('public.project_results') is not null then raise exception 'Ajuste da Etapa 3 já aplicado: nada a fazer.'; end if;"
  echo "end \$\$;"
  for f in supabase/migrations/20261126000200*.sql; do echo; echo "-- >>>>> $f"; cat "$f"; done
  echo; echo "commit;"
} > "$dir/atualizacao_etapa3_ajuste.sql"
echo "Gerado: $dir/atualizacao_etapa3_ajuste.sql"

# Etapa 4 = migrations a partir de 20261127 (recursos, orçamento, benchmarking, riscos)
{
  header "ATUALIZAÇÃO — ETAPA 4 (recursos, orçamento, benchmarking, riscos, relatórios)" "Execute UMA ÚNICA VEZ num banco com as Etapas 1–3 (incluindo o ajuste da Etapa 3)."
  echo "begin;"
  echo "do \$\$ begin"
  echo "  if to_regclass('public.project_results') is null then raise exception 'Aplique antes a Etapa 3 e o ajuste (atualizacao_etapa3_ajuste.sql).'; end if;"
  echo "  if to_regclass('public.budget_items') is not null then raise exception 'Etapa 4 já instalada: nada a fazer.'; end if;"
  echo "end \$\$;"
  for f in supabase/migrations/20261127*.sql; do echo; echo "-- >>>>> $f"; cat "$f"; done
  echo; echo "commit;"
} > "$dir/atualizacao_etapa4.sql"
echo "Gerado: $dir/atualizacao_etapa4.sql"

# Etapa 4.1 = migrations a partir de 20261128 (calendário e cadências)
{
  header "ATUALIZAÇÃO — ETAPA 4.1 (calendário de feriados/recessos e cadências)" "Execute UMA ÚNICA VEZ num banco com as Etapas 1–4."
  echo "begin;"
  echo "do \$\$ begin"
  echo "  if to_regclass('public.budget_items') is null then raise exception 'Aplique antes a Etapa 4 (atualizacao_etapa4.sql).'; end if;"
  echo "  if to_regclass('public.calendar_days') is not null then raise exception 'Etapa 4.1 já instalada: nada a fazer.'; end if;"
  echo "end \$\$;"
  for f in supabase/migrations/20261128*.sql; do echo; echo "-- >>>>> $f"; cat "$f"; done
  echo; echo "commit;"
} > "$dir/atualizacao_etapa4_1.sql"
echo "Gerado: $dir/atualizacao_etapa4_1.sql"

# Etapa 4.2 = migrations a partir de 20261129 (workflow de ações com validação + standby)
{
  header "ATUALIZAÇÃO — ETAPA 4.2 (workflow de ações com validação, tema, bloqueio e BI)" "Execute UMA ÚNICA VEZ num banco com as Etapas 1–4.1."
  echo "begin;"
  echo "do \$\$ begin"
  echo "  if to_regclass('public.calendar_days') is null then raise exception 'Aplique antes a Etapa 4.1 (atualizacao_etapa4_1.sql).'; end if;"
  echo "  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'actions' and column_name = 'validation_requested_at') then raise exception 'Etapa 4.2 já instalada: nada a fazer.'; end if;"
  echo "end \$\$;"
  for f in supabase/migrations/20261129*.sql; do echo; echo "-- >>>>> $f"; cat "$f"; done
  echo; echo "commit;"
} > "$dir/atualizacao_etapa4_2.sql"
echo "Gerado: $dir/atualizacao_etapa4_2.sql"
