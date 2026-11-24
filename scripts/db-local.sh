#!/usr/bin/env bash
# Recria o banco de TESTE local (PostgreSQL comum + shims do Supabase) e aplica as migrations.
# Uso: scripts/db-local.sh [--seed-references] [--seed-demo]
# Variáveis: PGHOST (padrão /tmp), PGPORT (54329), PGUSER (postgres), TEST_DB (competevix_test)
set -euo pipefail
cd "$(dirname "$0")/.."
export PGHOST="${PGHOST:-/tmp}" PGPORT="${PGPORT:-54329}" PGUSER="${PGUSER:-postgres}"
DB="${TEST_DB:-competevix_test}"
psql -q -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists $DB with (force)" -c "create database $DB"
run() { psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$1" > /dev/null; echo "ok  $1"; }
run supabase/tests/shims/00_supabase_shim.sql
for f in supabase/migrations/*.sql; do run "$f"; done
for arg in "$@"; do
  case "$arg" in
    --seed-references) run supabase/seed/references.sql ;;
    --seed-demo) run supabase/seed/demo.sql ;;
  esac
done
