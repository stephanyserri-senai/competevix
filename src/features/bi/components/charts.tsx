"use client";

/**
 * Gráficos do BI de ações (Recharts). Paleta categórica de referência validada
 * (azul, laranja, água, amarelo — ordem fixa; contraste < 3:1 em água/amarelo ⇒
 * legenda + tooltip + tabela equivalente). Marcas finas, 2px de respiro entre
 * segmentos, cantos de 4px na ponta, grade recessiva, um único eixo.
 */
import { STAGE_COLOR } from "@/features/bi/colors";
import {
  Bar, BarChart, CartesianGrid, LabelList, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"] as const;
const AXIS = { fill: "#64748b", fontSize: 12 };
const GRID = "#e2e8f0";
const tooltipStyle = { borderRadius: 12, borderColor: "#e2e8f0", fontSize: 12, boxShadow: "0 8px 24px -12px rgba(15,23,42,.25)" };

export type StackRow = { label: string; concluida: number; em_andamento: number; em_validacao: number; a_fazer: number };
const STACK_KEYS: ["a_fazer" | "em_andamento" | "em_validacao" | "concluida", string][] = [["a_fazer", "A fazer"], ["em_andamento", "Em andamento"], ["em_validacao", "Em validação"], ["concluida", "Concluída"]];

export function StackedByGroup({ data, height = 220 }: { data: StackRow[]; height?: number }) {
  return (
    <div style={{ height }} role="img" aria-label={`Ações por etapa: ${data.map((d) => `${d.label}: ${d.concluida} concluídas, ${d.em_andamento} em andamento, ${d.em_validacao} em validação, ${d.a_fazer} a fazer`).join("; ")}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }} barCategoryGap={14}>
          <CartesianGrid horizontal={false} stroke={GRID} />
          <XAxis type="number" allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="label" width={130} tick={{ ...AXIS, fill: "#334155" }} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: "#f1f5f9" }} contentStyle={tooltipStyle} />
          <Legend itemSorter={null} verticalAlign="top" align="left" iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingBottom: 8, color: "#334155" }} />
          {STACK_KEYS.map(([k, name], i) => (
            <Bar key={k} dataKey={k} name={name} stackId="s" fill={STAGE_COLOR[k]} stroke="#fff" strokeWidth={2} maxBarSize={22}
              radius={i === STACK_KEYS.length - 1 ? [0, 4, 4, 0] : 0} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function WeeklyLines({ data, height = 240 }: { data: { week: string; label: string; concluidas: number; criadas: number }[]; height?: number }) {
  return (
    <div style={{ height }} role="img" aria-label={`Ações por semana: ${data.map((d) => `${d.label}: ${d.criadas} criadas, ${d.concluidas} concluídas`).join("; ")}`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: -16 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: "#94a3b8", strokeDasharray: "3 3" }} />
          <Legend itemSorter={null} verticalAlign="top" align="left" iconType="plainline" iconSize={14} wrapperStyle={{ fontSize: 12, paddingBottom: 8, color: "#334155" }} />
          <Line type="monotone" dataKey="concluidas" name="Concluídas" stroke={STAGE_COLOR.concluida} strokeWidth={2} dot={false} activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }} isAnimationActive={false} />
          <Line type="monotone" dataKey="criadas" name="Criadas" stroke={STAGE_COLOR.em_andamento} strokeWidth={2} dot={false} activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SingleBars({ data, height = 220 }: { data: { label: string; value: number }[]; height?: number }) {
  return (
    <div style={{ height }} role="img" aria-label={data.map((d) => `${d.label}: ${d.value}`).join(", ")}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 32, bottom: 4, left: 8 }} barCategoryGap={12}>
          <CartesianGrid horizontal={false} stroke={GRID} />
          <XAxis type="number" allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="label" width={110} tick={{ ...AXIS, fill: "#334155" }} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: "#f1f5f9" }} contentStyle={tooltipStyle} formatter={(v) => [`${v} ação(ões)`, "Em aberto"]} />
          <Bar dataKey="value" fill={SERIES[0]} radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false}>
            <LabelList dataKey="value" position="right" fill="#334155" fontSize={12} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
