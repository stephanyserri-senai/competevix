-- =============================================================================
-- COMPETE VIX — Ciclo renomeado para 2027–2028 (decisão da supervisão em 25/11/2026)
-- Idempotente: só altera o ciclo de referência "2027" se o novo código ainda não existir.
-- Os programas continuam ligados ao mesmo ciclo (mesmo id); só código e nome mudam.
-- =============================================================================
update public.cycles
   set code = '2027-2028', name = 'Ciclo 2027–2028'
 where code = '2027'
   and not exists (select 1 from public.cycles where code = '2027-2028');
