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
