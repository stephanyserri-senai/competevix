/**
 * Feriados nacionais (para carga opcional no calendário). Datas fixas por lei e
 * Sexta-feira da Paixão calculada a partir da Páscoa (algoritmo gregoriano anônimo).
 * Feriados estaduais, municipais, recessos e pontos facultativos são cadastrados pela instituição.
 */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function nationalHolidays(year: number): { day: string; description: string; source: string }[] {
  const easter = new Date(`${easterSunday(year)}T00:00:00Z`);
  const goodFriday = new Date(easter.getTime() - 2 * 86400000).toISOString().slice(0, 10);
  const fixed: [string, string, string][] = [
    ["01-01", "Confraternização Universal", "Lei 662/1949"],
    ["04-21", "Tiradentes", "Lei 662/1949"],
    ["05-01", "Dia do Trabalho", "Lei 662/1949"],
    ["09-07", "Independência do Brasil", "Lei 662/1949"],
    ["10-12", "Nossa Senhora Aparecida", "Lei 6.802/1980"],
    ["11-02", "Finados", "Lei 662/1949"],
    ["11-15", "Proclamação da República", "Lei 662/1949"],
    ["11-20", "Dia Nacional de Zumbi e da Consciência Negra", "Lei 14.759/2023"],
    ["12-25", "Natal", "Lei 662/1949"],
  ];
  return [
    ...fixed.map(([md, description, source]) => ({ day: `${year}-${md}`, description, source })),
    { day: goodFriday, description: "Paixão de Cristo", source: "Calendário federal (data móvel)" },
  ].sort((x, y) => x.day.localeCompare(y.day));
}

export const CALENDAR_KIND_LABEL = {
  feriado_nacional: "Feriado nacional", feriado_estadual: "Feriado estadual", feriado_municipal: "Feriado municipal",
  recesso: "Recesso", ponto_facultativo: "Ponto facultativo", outro: "Outro",
} as const;

export const CADENCE_OPTIONS = {
  simulado_parcial: { "": "Não configurado (sem alerta)", semanal: "Semanal", quinzenal: "Quinzenal", nenhum: "Não se aplica" },
  simulado_completo: { "": "Não configurado (sem alerta)", mensal: "Mensal", semanal: "Semanal", nenhum: "Não se aplica" },
  simulado_externo: { "": "Não configurado (sem alerta)", trimestral: "Trimestral", nenhum: "Não se aplica" },
} as const;
