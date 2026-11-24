"use client";

import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/**
 * Ações por status (série única → uma cor, sem legenda; o título nomeia a série).
 * Barras finas com cantos de 4px, grade recessiva, rótulo direto do valor e tooltip.
 * Equivalente em tabela é renderizado ao lado pelo componente pai (acessibilidade).
 */
export function StatusChart({ data }: { data: { label: string; value: number }[] }) {
  return (
    <div className="h-56 w-full" role="img" aria-label={`Ações por status: ${data.map((d) => `${d.label} ${d.value}`).join(", ")}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 32, bottom: 4, left: 8 }} barCategoryGap={10}>
          <CartesianGrid horizontal={false} stroke="#e2e8f0" />
          <XAxis type="number" allowDecimals={false} tick={{ fill: "#475569", fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="label" width={110} tick={{ fill: "#334155", fontSize: 12 }} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: "#eef4fb" }}
            formatter={(v) => [`${v} ação(ões)`, "Quantidade"]}
            contentStyle={{ borderRadius: 6, borderColor: "#cbd5e1", fontSize: 12 }}
          />
          <Bar dataKey="value" fill="#1d4f95" radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false}>
            <LabelList dataKey="value" position="right" fill="#334155" fontSize={12} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
