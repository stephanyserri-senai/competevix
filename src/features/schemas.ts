/**
 * Schemas Zod compartilhados entre cliente (validação imediata no ActionForm)
 * e servidor (Server Actions). Os limites espelham os CHECKs do banco.
 */
import { z } from "zod";
import { emptyToNull, zCheckbox, zDate, zOptDate, zOptText, zOptUuid, zText, zUuid } from "@/lib/forms";

const zCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9_-]{1,19}$/, "Código: 2–20 caracteres (letras maiúsculas, números, - ou _).");
const zOptId = z.preprocess(emptyToNull, z.uuid().nullable().optional());
const toArray = (v: unknown) => (v === undefined || v === null || v === "" ? [] : Array.isArray(v) ? v : [v]);
const endAfterStart = <T extends { start_date?: string | null; end_date?: string | null }>(d: T) =>
  !d.start_date || !d.end_date || d.end_date >= d.start_date;
const zTime = (label: string) => z.string().regex(/^\d{2}:\d{2}$/, `${label}: use o formato HH:MM.`);

/* ---------------------------------------------------------------- Catálogo */
export const unitSchema = z.object({ id: zOptId, code: zCode, name: zText(2, 120, "Nome") });

export const competitionSchema = z.object({
  id: zOptId,
  code: zCode,
  name: zText(2, 120, "Nome"),
  kind: z.enum(["worldskills", "inova", "frc", "giaffone", "ekart", "outra"], { message: "Tipo inválido." }),
  description: zOptText(2000, "Descrição"),
});

export const cycleSchema = z
  .object({ id: zOptId, code: zCode, name: zText(2, 120, "Nome"), start_date: zOptDate("Início"), end_date: zOptDate("Término") })
  .refine(endAfterStart, { path: ["end_date"], message: "Término deve ser igual ou posterior ao início." });

export const programSchema = z.object({
  competition_id: zUuid("Competição"),
  cycle_id: zUuid("Ciclo"),
  unit_id: zUuid("Unidade"),
  status: z.enum(["planejamento", "ativo", "encerrado"]),
});

export const programSettingsSchema = z.object({
  id: zUuid("Programa"),
  status: z.enum(["planejamento", "ativo", "encerrado"]),
  acao_conclusao_exige: z.enum(["nada", "nota", "evidencia", "nota_ou_evidencia"]),
});

export const stageSchema = z
  .object({
    id: zOptId,
    program_id: zUuid("Programa"),
    name: zText(2, 120, "Nome"),
    position: z.coerce.number().int().min(0).max(100),
    start_date: zOptDate("Início"),
    end_date: zOptDate("Término"),
    location: zOptText(200, "Local"),
    notes: zOptText(2000, "Observações"),
  })
  .refine(endAfterStart, { path: ["end_date"], message: "Término deve ser igual ou posterior ao início." });

export const occupationSchema = z
  .object({
    id: zOptId,
    program_id: zUuid("Programa"),
    code: zText(1, 20, "Código"),
    name: zText(2, 120, "Nome"),
    target_score: z.preprocess(emptyToNull, z.coerce.number().min(0, "Meta não pode ser negativa.").max(100000).nullable()),
    target_source: zOptText(300, "Fonte da meta"),
  })
  .refine((d) => d.target_score === null || Boolean(d.target_source), {
    path: ["target_source"],
    message: "Informe a fonte da meta (ex.: infográfico — validar).",
  });

/* ------------------------------------------------------- Pessoas e equipes */
export const personSchema = z.object({
  id: zOptId,
  unit_id: zUuid("Unidade"),
  full_name: zText(2, 160, "Nome"),
  kind: z.enum(["aluno", "docente", "colaborador", "externo"]),
  email: z.preprocess(emptyToNull, z.email({ message: "E-mail inválido." }).max(200).nullable()),
});

export const teamSchema = z.object({
  id: zOptId,
  program_id: zUuid("Programa"),
  name: zText(2, 120, "Nome"),
  occupation_id: zOptUuid("Ocupação"),
  notes: zOptText(2000, "Observações"),
});

export const teamMemberSchema = z
  .object({
    team_id: zUuid("Equipe"),
    program_id: zUuid("Programa"),
    person_id: zUuid("Pessoa"),
    role: z.enum(["competidor", "suplente", "orientador_titular", "orientador_reserva"]),
    valid_from: zDate("Início da vigência"),
    valid_to: zOptDate("Fim da vigência"),
    note: zOptText(500, "Observação"),
  })
  .refine((d) => !d.valid_to || d.valid_to >= d.valid_from, { path: ["valid_to"], message: "Fim deve ser igual ou posterior ao início." });

export const endTeamMemberSchema = z.object({ id: zUuid("Vínculo"), valid_to: zDate("Fim da vigência") });

/* ------------------------------------------------------------------ Agenda */
export const eventSchema = z
  .object({
    id: zOptId,
    program_id: zUuid("Programa"),
    team_id: zOptUuid("Equipe"),
    title: zText(2, 200, "Título"),
    type: z.enum(["treino", "reuniao", "simulado", "banca", "visita", "competicao", "prazo", "outro"]),
    description: zOptText(4000, "Descrição"),
    location: zOptText(200, "Local"),
    date: zDate("Data"),
    start_time: zTime("Início"),
    end_time: zTime("Término"),
    owner_person_id: zOptUuid("Responsável"),
    participant_ids: z.preprocess(toArray, z.array(z.uuid())),
    recurrence_freq: z.preprocess(emptyToNull, z.enum(["diaria", "semanal", "mensal"]).nullable()),
    recurrence_interval: z.coerce.number().int().min(1).max(52).default(1),
    recurrence_weekdays: z.preprocess(toArray, z.array(z.coerce.number().int().min(0).max(6))),
    recurrence_end: z.enum(["count", "until"]).default("count"),
    recurrence_count: z.preprocess(emptyToNull, z.coerce.number().int().min(1).max(500).nullable()),
    recurrence_until: zOptDate("Repetir até"),
  })
  .refine((d) => d.end_time > d.start_time, { path: ["end_time"], message: "Término deve ser após o início." })
  .refine((d) => !d.recurrence_freq || (d.recurrence_end === "count" ? d.recurrence_count !== null : d.recurrence_until !== null), {
    path: ["recurrence_count"],
    message: "Recorrência precisa de término: número de ocorrências ou data final.",
  })
  .refine((d) => !d.recurrence_freq || d.recurrence_end !== "until" || !d.recurrence_until || d.recurrence_until >= d.date, {
    path: ["recurrence_until"],
    message: "Data final deve ser posterior à primeira ocorrência.",
  });

export const eventExceptionSchema = z
  .object({
    event_id: zUuid("Evento"),
    program_id: zUuid("Programa"),
    occurrence_start: z.iso.datetime({ offset: true, message: "Ocorrência inválida." }),
    kind: z.enum(["cancelada", "alterada"]),
    new_date: zOptDate("Nova data"),
    new_start_time: z.preprocess(emptyToNull, zTime("Novo início").nullable()),
    new_end_time: z.preprocess(emptyToNull, zTime("Novo término").nullable()),
    new_title: zOptText(200, "Novo título"),
    note: zOptText(1000, "Observação"),
  })
  .refine((d) => d.kind === "cancelada" || (d.new_date && d.new_start_time && d.new_end_time && d.new_end_time > d.new_start_time), {
    path: ["new_end_time"],
    message: "Para alterar, informe nova data, início e término (término após o início).",
  });

/* ------------------------------------------------------------------- Ações */
export const actionSchema = z
  .object({
    id: zOptId,
    program_id: zUuid("Programa"),
    team_id: zOptUuid("Equipe"),
    title: zText(3, 200, "Título"),
    description: zOptText(4000, "Descrição"),
    owner_person_id: zOptUuid("Responsável"),
    start_date: zOptDate("Início"),
    due_date: zOptDate("Prazo"),
    priority: z.enum(["baixa", "media", "alta", "critica"]),
    requires_evidence: zCheckbox,
  })
  .refine((d) => !d.start_date || !d.due_date || d.due_date >= d.start_date, { path: ["due_date"], message: "Prazo deve ser igual ou posterior ao início." });

export const actionStatusSchema = z.object({
  id: zUuid("Ação"),
  status: z.enum(["aberta", "em_andamento", "bloqueada", "concluida", "cancelada"]),
  note: zOptText(4000, "Justificativa"),
});

export const dependencySchema = z.object({ action_id: zUuid("Ação"), depends_on_id: zUuid("Dependência"), program_id: zUuid("Programa") });

export const evidenceLinkSchema = z.object({
  action_id: zUuid("Ação"),
  program_id: zUuid("Programa"),
  url: z.string().trim().max(2000).regex(/^https:\/\/\S+$/i, "Informe um endereço https:// válido."),
  note: zOptText(2000, "Descrição"),
});

export const commentSchema = z.object({ action_id: zUuid("Ação"), program_id: zUuid("Programa"), note: zText(1, 4000, "Comentário") });

export const backlogImportSchema = z.object({ program_id: zUuid("Programa"), group: z.enum(["geral", "worldskills", "inova"]) });

/* -------------------------------------------------------------- Checklists */
export const checklistTemplateSchema = z.object({
  program_id: zUuid("Programa"),
  name: zText(3, 160, "Nome"),
  description: zOptText(2000, "Descrição"),
  cadence: z.enum(["semanal", "mensal", "avulsa"]),
  scope: z.enum(["programa", "equipe"]),
});

export const checklistItemSchema = z.object({
  template_id: zUuid("Modelo"),
  program_id: zUuid("Programa"),
  label: zText(3, 300, "Item"),
  guidance: zOptText(1000, "Orientação"),
  required: zCheckbox,
  requires_evidence: zCheckbox,
});

export const checklistRunSchema = z
  .object({
    template_id: zUuid("Modelo"),
    program_id: zUuid("Programa"),
    team_id: zOptUuid("Equipe"),
    period_start: zDate("Início do período"),
    period_end: zDate("Fim do período"),
  })
  .refine((d) => d.period_end >= d.period_start, { path: ["period_end"], message: "Fim deve ser igual ou posterior ao início." });

export const checklistAnswerSchema = z.object({
  run_id: zUuid("Aplicação"),
  template_id: zUuid("Modelo"),
  item_id: zUuid("Item"),
  program_id: zUuid("Programa"),
  value: z.enum(["sim", "nao", "na"], { message: "Escolha uma resposta." }),
  note: zOptText(2000, "Observação"),
});

/* --------------------------------------------------------------- Documentos */
export const documentMetaSchema = z.object({
  program_id: zUuid("Programa"),
  team_id: zOptUuid("Equipe"),
  title: zText(2, 200, "Título"),
  classification: z.enum(["interno", "restrito", "confidencial"]),
  supersedes_id: zOptUuid("Documento anterior"),
});

/* ----------------------------------------------------------- Administração */
export const inviteSchema = z.object({
  email: z.email({ message: "E-mail inválido." }).max(200),
  display_name: zText(2, 120, "Nome de exibição"),
});

export const membershipSchema = z
  .object({
    user_id: zUuid("Usuário"),
    scope: z.enum(["programa", "unidade"]),
    program_id: zOptUuid("Programa"),
    unit_id: zOptUuid("Unidade"),
    role: z.enum(["supervisao", "orientador", "competidor", "gestao", "avaliador", "napi"]),
    valid_from: zDate("Início"),
    valid_to: zOptDate("Fim"),
    note: zOptText(500, "Observação"),
  })
  .refine((d) => (d.scope === "programa" ? Boolean(d.program_id) : Boolean(d.unit_id)), {
    path: ["program_id"],
    message: "Selecione o programa ou a unidade do vínculo.",
  })
  .refine((d) => d.scope === "programa" || ["supervisao", "gestao"].includes(d.role), {
    path: ["role"],
    message: "Vínculo por unidade é permitido apenas para Supervisão e Gestão.",
  })
  .refine((d) => !d.valid_to || d.valid_to >= d.valid_from, { path: ["valid_to"], message: "Fim deve ser igual ou posterior ao início." });

/* ----------------------------------------------------- Etapa 2: WorldSkills */
const zMinutes = (label: string, max = 20000) =>
  z.coerce.number({ message: `${label}: informe um número.` }).int(`${label}: use minutos inteiros.`).min(1, `${label}: mínimo 1 minuto.`).max(max, `${label}: valor muito alto.`);
const zHours = (label: string) =>
  z.coerce.number({ message: `${label}: informe horas.` }).min(1, `${label}: mínimo 1 h.`).max(70, `${label}: máximo 70 h.`);

export const allocationSchema = z
  .object({
    program_id: zUuid("Programa"),
    team_id: zOptUuid("Equipe"),
    person_id: zUuid("Pessoa"),
    base_weekly_hours: zHours("Jornada semanal"),
    percent: z.coerce.number().min(1, "Percentual entre 1 e 100.").max(100, "Percentual entre 1 e 100."),
    valid_from: zDate("Início"),
    valid_to: zOptDate("Fim"),
    note: zOptText(500, "Observação"),
  })
  .refine((d) => !d.valid_to || d.valid_to >= d.valid_from, { path: ["valid_to"], message: "Fim deve ser igual ou posterior ao início." });

export const competencySchema = z
  .object({
    id: zOptId,
    program_id: zUuid("Programa"),
    occupation_id: zUuid("Ocupação"),
    name: zText(2, 160, "Competência"),
    weight: z.preprocess(emptyToNull, z.coerce.number().min(0).max(1000).nullable()),
    weight_source: zOptText(300, "Fonte do peso"),
  })
  .refine((d) => d.weight === null || Boolean(d.weight_source), { path: ["weight_source"], message: "Peso exige fonte (documento técnico oficial validado)." });

export const trainingPlanSchema = z
  .object({ program_id: zUuid("Programa"), team_id: zUuid("Equipe"), title: zText(3, 160, "Título"), period_start: zDate("Início"), period_end: zDate("Fim") })
  .refine((d) => d.period_end >= d.period_start, { path: ["period_end"], message: "Fim deve ser igual ou posterior ao início." });

export const trainingItemSchema = z.object({
  plan_id: zUuid("Plano"),
  program_id: zUuid("Programa"),
  competency_id: zOptUuid("Competência"),
  objective: zText(3, 500, "Objetivo"),
  activity: zText(3, 1000, "Atividade"),
  planned_minutes: zMinutes("Horas previstas (min)"),
  responsible_person_id: zOptUuid("Responsável"),
  resource: zOptText(500, "Recurso"),
  expected_evidence: zOptText(500, "Evidência"),
  acceptance_criteria: zOptText(1000, "Critério de aceite"),
  due_date: zDate("Prazo"),
});

export const itemStatusSchema = z.object({
  id: zUuid("Item"),
  plan_id: zUuid("Plano"),
  status: z.enum(["previsto", "concluido", "cancelado"]),
  status_note: zOptText(1000, "Justificativa"),
});

export const planVersionSchema = z.object({ id: zUuid("Plano"), note: zText(3, 2000, "Motivo da alteração") });

export const sessionSchema = z
  .object({
    program_id: zUuid("Programa"),
    team_id: zUuid("Equipe"),
    training_item_id: zOptUuid("Item do plano"),
    competency_id: zOptUuid("Competência"),
    date: zDate("Data"),
    start_time: zTime("Início"),
    end_time: zTime("Término"),
    break_minutes: z.coerce.number().int().min(0).max(600).default(0),
    location: zOptText(200, "Local"),
    notes: zOptText(2000, "Observações"),
  })
  .refine((d) => d.end_time > d.start_time, { path: ["end_time"], message: "Término deve ser após o início." });

export const attendanceSchema = z
  .object({
    session_id: zUuid("Sessão"),
    program_id: zUuid("Programa"),
    person_id: zUuid("Pessoa"),
    status: z.enum(["presente", "parcial", "ausente", "justificada"]),
    attended_minutes: z.preprocess(emptyToNull, z.coerce.number().int().min(0).max(1000).nullable()),
    justification: zOptText(1000, "Justificativa"),
  })
  .refine((d) => d.status !== "parcial" || (d.attended_minutes !== null && d.attended_minutes > 0), { path: ["attended_minutes"], message: "Informe os minutos presentes." })
  .refine((d) => d.status !== "justificada" || Boolean(d.justification), { path: ["justification"], message: "Informe a justificativa." });

export const assessmentSchema = z
  .object({
    program_id: zUuid("Programa"),
    team_id: zUuid("Equipe"),
    occupation_id: zOptUuid("Ocupação"),
    type: z.enum(["parcial", "completo", "externo", "diagnostico"]),
    title: zText(3, 160, "Título"),
    test_version: zOptText(60, "Versão da prova"),
    criteria_version: zOptText(60, "Versão dos critérios"),
    held_on: zDate("Data"),
    scale: z.enum(["worldskills", "percentual", "pontos_brutos"]),
    scale_max: z.coerce.number().positive("Máximo da escala deve ser positivo.").max(100000),
    planned_minutes: z.preprocess(emptyToNull, z.coerce.number().int().positive().max(5000).nullable()),
    actual_minutes: z.preprocess(emptyToNull, z.coerce.number().int().positive().max(5000).nullable()),
  })
  .refine((d) => d.scale !== "percentual" || d.scale_max === 100, { path: ["scale_max"], message: "Escala percentual tem máximo 100." });

export const resultSchema = z.object({
  assessment_id: zUuid("Simulado"),
  program_id: zUuid("Programa"),
  person_id: zOptUuid("Pessoa"),
  criterion: zOptText(160, "Critério"),
  score: z.coerce.number({ message: "Nota inválida." }).min(0, "Nota não pode ser negativa."),
});

export const errorSchema = z.object({
  id: zOptId,
  assessment_id: zUuid("Simulado"),
  program_id: zUuid("Programa"),
  competency_id: zOptUuid("Competência"),
  description: zText(3, 1000, "Erro"),
  root_cause: zOptText(1000, "Causa raiz"),
  corrective_action: zOptText(1000, "Ação corretiva"),
  owner_person_id: zOptUuid("Responsável"),
  due_date: zOptDate("Prazo"),
  status: z.enum(["aberta", "em_andamento", "concluida"]),
}).refine((d) => d.status !== "concluida" || (d.root_cause && d.corrective_action), { path: ["root_cause"], message: "Para concluir, informe causa raiz e ação corretiva." });

export const scoreTargetSchema = z.object({
  program_id: zUuid("Programa"),
  occupation_id: zUuid("Ocupação"),
  month: z.string().regex(/^\d{4}-\d{2}$/, "Mês inválido."),
  target: z.coerce.number().min(0, "Meta não pode ser negativa.").max(100000),
  scale: z.enum(["worldskills", "percentual", "pontos_brutos"]),
  status: z.enum(["proposta", "aprovada"]),
  source: zText(3, 300, "Fonte/justificativa"),
});

export const weeklyReportSchema = z.object({
  id: zOptId,
  program_id: zUuid("Programa"),
  team_id: zUuid("Equipe"),
  week_start: zDate("Semana"),
  planned_hours: z.coerce.number().min(0).max(2000),
  actual_hours: z.coerce.number().min(0).max(2000),
  outcomes: zOptText(4000, "Resultados"),
  blockers: zOptText(4000, "Dificuldades"),
  intervention: zOptText(4000, "Intervenção"),
  next_steps: zOptText(4000, "Próximas entregas"),
});

export const reportStatusSchema = z.object({
  id: zUuid("Relatório"),
  status: z.enum(["enviado", "em_revisao", "aprovado", "devolvido"]),
  note: zOptText(2000, "Observação"),
});

/* --------------------------------------------------------- Etapa 3: INOVA */
const STAGE_VALUES = ["prospeccao", "selecao", "anterioridade", "validacao_problema", "prototipo", "validacao_tecnica_financeira", "banca_pitch", "prioritario"] as const;
const EVIDENCE_VALUES = ["comparacao_mercado", "diferencial_tecnico", "validacao_industrial", "teste_produtividade_custo_qualidade", "viabilidade_financeira", "modelo_negocio", "anterioridade", "prototipo_funcional", "outro"] as const;

export const projectSchema = z.object({
  id: zOptId,
  program_id: zUuid("Programa"),
  team_id: zUuid("Equipe"),
  title: zText(3, 200, "Título"),
  problem: zOptText(4000, "Problema"),
  solution: zOptText(4000, "Solução"),
  partner_company: zOptText(200, "Empresa parceira"),
  value_proposition: zOptText(4000, "Proposta de valor"),
  differential: zOptText(4000, "Diferencial"),
  business_model: zOptText(4000, "Modelo de negócio"),
});

export const projectEvidenceSchema = z
  .object({
    project_id: zUuid("Projeto"),
    program_id: zUuid("Programa"),
    kind: z.enum(EVIDENCE_VALUES),
    description: zText(3, 2000, "Descrição"),
    url: z.preprocess(emptyToNull, z.string().trim().max(2000).regex(/^https:\/\/\S+$/i, "Informe um endereço https:// válido.").nullable()),
  })
  .refine((d) => d.url !== null || d.kind === "outro" || d.description.length >= 20, { path: ["description"], message: "Sem link, descreva a evidência com ao menos 20 caracteres." });

export const advanceSchema = z.object({ project_id: zUuid("Projeto"), to_stage: z.enum(STAGE_VALUES), note: zOptText(2000, "Justificativa") });

export const panelSchema = z.object({
  program_id: zUuid("Programa"),
  project_id: zUuid("Projeto"),
  rubric_version_id: zUuid("Rubrica"),
  title: zText(3, 160, "Título"),
  held_on: zDate("Data"),
});

export const assignmentSchema = z.object({ panel_id: zUuid("Banca"), program_id: zUuid("Programa"), evaluator_id: zUuid("Avaliador") });
export const reviseSchema = z.object({ id: zUuid("Banca"), note: zText(3, 2000, "Motivo da revisão") });

export const criterionSchema = z.object({
  version_id: zUuid("Versão"),
  parent_id: zOptUuid("Grupo"),
  code: zText(1, 30, "Código"),
  name: zText(2, 160, "Nome"),
  max_score: z.coerce.number().positive("Máximo deve ser positivo.").max(1000),
  position: z.coerce.number().int().min(0).max(100).default(0),
});

export const SCHEMAS = {
  unit: unitSchema,
  competition: competitionSchema,
  cycle: cycleSchema,
  program: programSchema,
  programSettings: programSettingsSchema,
  stage: stageSchema,
  occupation: occupationSchema,
  person: personSchema,
  team: teamSchema,
  teamMember: teamMemberSchema,
  endTeamMember: endTeamMemberSchema,
  event: eventSchema,
  eventException: eventExceptionSchema,
  action: actionSchema,
  actionStatus: actionStatusSchema,
  dependency: dependencySchema,
  evidenceLink: evidenceLinkSchema,
  comment: commentSchema,
  backlogImport: backlogImportSchema,
  checklistTemplate: checklistTemplateSchema,
  checklistItem: checklistItemSchema,
  checklistRun: checklistRunSchema,
  checklistAnswer: checklistAnswerSchema,
  documentMeta: documentMetaSchema,
  invite: inviteSchema,
  membership: membershipSchema,
  allocation: allocationSchema,
  competency: competencySchema,
  trainingPlan: trainingPlanSchema,
  trainingItem: trainingItemSchema,
  itemStatus: itemStatusSchema,
  planVersion: planVersionSchema,
  session: sessionSchema,
  attendance: attendanceSchema,
  assessment: assessmentSchema,
  result: resultSchema,
  assessmentError: errorSchema,
  scoreTarget: scoreTargetSchema,
  weeklyReport: weeklyReportSchema,
  reportStatus: reportStatusSchema,
  project: projectSchema,
  projectEvidence: projectEvidenceSchema,
  advance: advanceSchema,
  panel: panelSchema,
  assignment: assignmentSchema,
  revise: reviseSchema,
  criterion: criterionSchema,
} as const;

export type SchemaKey = keyof typeof SCHEMAS;
