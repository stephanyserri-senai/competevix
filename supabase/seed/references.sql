-- =============================================================================
-- SEED DE REFERÊNCIAS — somente dados identificados no PRD v0.1 (24/11/2026).
-- Não contém pessoas, usuários, notas ou datas inventadas. Idempotente.
-- Fontes: infográficos da gestão e reunião de 24/11/2026 (PRD §1, §6, §7).
-- Itens marcados "validar" dependem de confirmação institucional (PRD §14).
-- =============================================================================

insert into public.units (code, name) values
  ('BEIRA-MAR', 'SENAI Vitória — Beira-Mar'),
  ('PORTO', 'SENAI Vitória — Porto')
on conflict (code) do nothing;

insert into public.competitions (code, name, kind, description) values
  ('WORLDSKILLS', 'WorldSkills', 'worldskills', 'Prioridade do MVP (PRD §2).'),
  ('INOVA', 'INOVA SENAI', 'inova', 'Prioridade do MVP (PRD §2).'),
  ('FRC', 'FIRST Robotics Competition (FRC)', 'frc', 'Cadastrável com módulos comuns; levantamento específico na etapa 5.'),
  ('GIAFFONE', 'Giaffone', 'giaffone', 'Cadastrável com módulos comuns; levantamento específico na etapa 5.'),
  ('E-KART', 'E-Kart', 'ekart', 'Cadastrável com módulos comuns; levantamento específico na etapa 5.')
on conflict (code) do nothing;

-- Ciclo 2027–2028 (decisão da supervisão, 25/11/2026). Datas oficiais ainda não informadas: permanecem vazias.
insert into public.cycles (code, name) values ('2027-2028', 'Ciclo 2027–2028')
on conflict (code) do nothing;

-- Programas com evidência no PRD:
--   WorldSkills Beira-Mar (#33, #48), WorldSkills Porto (#50), INOVA Beira-Mar (Digital Twin, base 2026)
insert into public.programs (competition_id, cycle_id, unit_id, status)
select c.id, cy.id, u.id, 'planejamento'
from (values ('WORLDSKILLS', 'BEIRA-MAR'), ('WORLDSKILLS', 'PORTO'), ('INOVA', 'BEIRA-MAR')) v(comp, unit)
join public.competitions c on c.code = v.comp
join public.units u on u.code = v.unit
join public.cycles cy on cy.code = '2027-2028'
on conflict (competition_id, cycle_id, unit_id) do nothing;

-- Ocupações e metas (PRD §6 — fonte: infográfico; validar edição e comparabilidade)
insert into public.occupations (program_id, code, name, target_score, target_source)
select p.id, v.code, v.name, v.target, 'Infográfico da gestão (PRD v0.1 §6) — meta proposta; validar com supervisão'
from (values
  ('BEIRA-MAR', '#33', 'Tecnologia Automotiva', 760),
  ('BEIRA-MAR', '#48', 'Indústria 4.0', 750),
  ('PORTO', '#50', 'Arte Digital 3D', 770)
) v(unit, code, name, target)
join public.units u on u.code = v.unit
join public.competitions c on c.code = 'WORLDSKILLS'
join public.cycles cy on cy.code = '2027-2028'
join public.programs p on p.competition_id = c.id and p.cycle_id = cy.id and p.unit_id = u.id
on conflict (program_id, code) do nothing;

-- Rubrica interna preliminar INOVA (criada aqui em instalações novas; idempotente)
select private.seed_inova_rubric();
