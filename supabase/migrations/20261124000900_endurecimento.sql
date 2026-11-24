-- =============================================================================
-- COMPETE VIX — 0900 Endurecimento de privilégios (defesa em profundidade)
-- No Supabase, privilégios padrão concedem acesso de tabela ao papel `anon`.
-- O RLS já nega tudo a `anon`; aqui também removemos o privilégio de tabela,
-- inclusive para objetos criados futuramente.
-- =============================================================================
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon;
revoke all on schema private from anon;
