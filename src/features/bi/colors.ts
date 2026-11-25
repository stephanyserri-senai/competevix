/**
 * Cor de cada etapa do workflow — a MESMA no quadro, nos gráficos e nos indicadores.
 * Valores da paleta categórica validada (skill dataviz); água e amarelo têm contraste
 * < 3:1 sobre branco, por isso sempre acompanham rótulo/legenda (nunca cor sozinha).
 */
export const STAGE_COLOR = {
  a_fazer: "#eda100",
  em_andamento: "#2a78d6",
  em_validacao: "#eb6834",
  concluida: "#1baf7a",
  cancelada: "#cbd5e1",
} as const;
