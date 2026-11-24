#!/usr/bin/env bash
# Gera supabase/instalacao/instalacao_completa.sql: todas as migrations + seed de referências,
# numa única transação, para colar no SQL Editor do Supabase (sem usar terminal/CLI).
# Regere sempre que uma migration for adicionada: scripts/bundle-sql.sh
set -euo pipefail
cd "$(dirname "$0")/.."
out=supabase/instalacao/instalacao_completa.sql
{
  echo "-- ============================================================================="
  echo "-- COMPETE VIX — INSTALAÇÃO COMPLETA DO BANCO (gerado por scripts/bundle-sql.sh)"
  echo "-- Execute UMA ÚNICA VEZ, num projeto Supabase novo, pelo SQL Editor."
  echo "-- Tudo roda numa transação: se algo falhar, nada é aplicado."
  echo "-- Conteúdo: migrations de supabase/migrations + supabase/seed/references.sql."
  echo "-- NÃO inclui dados de demonstração."
  echo "-- ============================================================================="
  echo "begin;"
  for f in supabase/migrations/*.sql supabase/seed/references.sql; do
    echo; echo "-- >>>>> $f"; cat "$f"
  done
  echo; echo "commit;"
} > "$out"
echo "Gerado: $out ($(wc -c < "$out") bytes)"
