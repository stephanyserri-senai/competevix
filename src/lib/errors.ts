/**
 * Tradução de erros do PostgREST/PostgreSQL para mensagens em pt-BR.
 * Mensagens de regras de negócio (RAISE EXCEPTION nos triggers) já estão em português
 * e são repassadas; erros técnicos viram mensagens genéricas, sem vazar detalhes.
 */
export type DbError = { code?: string; message?: string; details?: string | null; hint?: string | null };

export function translateDbError(error: DbError | null | undefined): string {
  if (!error) return "Erro desconhecido.";
  const msg = error.message ?? "";
  switch (error.code) {
    case "42501": // insufficient_privilege / RLS
      if (/row-level security|permission denied/i.test(msg)) {
        return "Você não tem permissão para esta operação neste escopo.";
      }
      return msg;
    case "23505":
      return "Já existe um registro com esses dados (duplicado).";
    case "23503":
      return "Referência inválida: o registro vinculado não existe ou pertence a outro escopo.";
    case "23514": // check_violation
      if (/^new row for relation|violates check constraint/i.test(msg)) {
        return "Dados fora das regras de validação.";
      }
      return msg;
    case "23P01":
      return "Conflito de vigência: já existe vínculo com o mesmo papel no período.";
    case "22P02":
      return "Valor em formato inválido.";
    case "PGRST116":
      return "Registro não encontrado ou sem permissão.";
    default:
      if (/JWT|session/i.test(msg)) return "Sua sessão expirou. Entre novamente.";
      return "Não foi possível concluir a operação. Tente novamente.";
  }
}
