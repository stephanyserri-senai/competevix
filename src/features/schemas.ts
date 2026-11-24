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
} as const;

export type SchemaKey = keyof typeof SCHEMAS;
