import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { toCsv } from "@/lib/csv";
import { addDays, zonedParts } from "@/lib/dates";
import { loadChData } from "@/features/worldskills/queries";
import { chByPerson } from "@/features/worldskills/domain";
import { reportPeriod } from "@/features/relatorios/period";

/**
 * Exportação CSV (RF14). Usa SEMPRE a sessão do usuário: o RLS define o que sai no arquivo
 * (ex.: orçamento só para supervisão/gestão). Inclui período e data de corte no nome.
 */
const qs = z.object({
  programa: z.uuid(),
  tipo: z.enum(["acoes", "ch", "riscos", "solicitacoes", "orcamento", "simulados", "fechamentos"]),
  periodo: z.enum(["semanal", "mensal"]).default("mensal"),
  corte: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const parsed = qs.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return new NextResponse("Parâmetros inválidos", { status: 400 });
  const { programa, tipo, periodo, corte } = parsed.data;
  const { start, end, cutoff } = reportPeriod(periodo, corte);
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return new NextResponse("Não autenticado", { status: 401 });

  let rows: (string | number | null)[][] = [];
  switch (tipo) {
    case "acoes": {
      const { data } = await supabase.from("actions_view").select("id, title, status, priority, due_date, is_overdue, team_id, owner_person_id, completed_at, created_at").eq("program_id", programa).is("archived_at", null).order("due_date");
      rows = [["id", "titulo", "status", "prioridade", "prazo", "atrasada_na_geracao", "equipe_id", "responsavel_id", "concluida_em", "criada_em"],
        ...(data ?? []).map((a) => [a.id, a.title, a.status, a.priority, a.due_date, a.is_overdue ? "sim" : "não", a.team_id, a.owner_person_id, a.completed_at, a.created_at])];
      break;
    }
    case "ch": {
      const { allocations, attendance, nonWorking } = await loadChData(supabase, programa, start, end);
      const teams = [...new Set(allocations.map((a) => a.team_id).filter(Boolean))] as string[];
      rows = [["equipe_id", "pessoa_id", "previsto_min", "efetivo_min", "ch_pct"]];
      for (const t of teams) for (const r of chByPerson(allocations, attendance, start, end, { teamId: t, nonWorking })) rows.push([t, r.person_id, r.planned, r.effective, r.pct === null ? "N/A" : Math.round(r.pct * 100) / 100]);
      break;
    }
    case "riscos": {
      const { data } = await supabase.from("risks").select("id, title, probability, impact, score, status, due_date, next_review, mitigation").eq("program_id", programa).is("archived_at", null).order("score", { ascending: false });
      rows = [["id", "risco", "probabilidade", "impacto", "pontuacao", "status", "prazo", "proxima_revisao", "mitigacao"],
        ...(data ?? []).map((r) => [r.id, r.title, r.probability, r.impact, r.score, r.status, r.due_date, r.next_review, r.mitigation])];
      break;
    }
    case "solicitacoes": {
      const { data } = await supabase.from("resource_requests").select("id, title, quantity, status, blocking, needs_analysis, needed_by, decided_at, created_at").eq("program_id", programa).order("created_at");
      rows = [["id", "item", "quantidade", "status", "bloqueante", "necessidade_a_analisar", "necessario_ate", "decidido_em", "criado_em"],
        ...(data ?? []).map((r) => [r.id, r.title, Number(r.quantity), r.status, r.blocking ? "sim" : "não", r.needs_analysis ? "sim" : "não", r.needed_by, r.decided_at, r.created_at])];
      break;
    }
    case "orcamento": {
      const { data } = await supabase.from("budget_item_summary").select("*").eq("program_id", programa);
      rows = [["item_id", "categoria", "descricao", "estimado", "solicitado", "aprovado", "comprometido", "compromissos_em_aberto", "realizado", "saldo"],
        ...(data ?? []).map((i) => [i.item_id, i.category, i.description, Number(i.estimated), Number(i.requested), Number(i.approved), Number(i.committed), Number(i.open_commitments), Number(i.realized), Number(i.balance)])];
      break;
    }
    case "simulados": {
      const { data } = await supabase.from("assessments").select("id, title, type, held_on, scale, scale_max, status, team_id, occupation_id, results:assessment_results(score, person_id, criterion)").eq("program_id", programa).gte("held_on", start).lte("held_on", end);
      rows = [["id", "titulo", "tipo", "data", "escala", "maximo", "status", "equipe_id", "ocupacao_id", "nota_equipe"],
        ...(data ?? []).map((a) => [a.id, a.title, a.type, a.held_on, a.scale, Number(a.scale_max), a.status, a.team_id, a.occupation_id,
          (() => { const r = a.results.find((x) => x.person_id === null && x.criterion === null); return r ? Number(r.score) : null; })()])];
      break;
    }
    case "fechamentos": {
      const { data } = await supabase.from("weekly_reports").select("id, team_id, week_start, version, status, planned_minutes, actual_minutes, submitted_at, reviewed_at").eq("program_id", programa).gte("week_start", addDays(start, -6)).lte("week_start", end).order("week_start");
      rows = [["id", "equipe_id", "semana", "versao", "status", "previsto_min", "realizado_min", "enviado_em", "revisado_em"],
        ...(data ?? []).map((r) => [r.id, r.team_id, r.week_start, r.version, r.status, r.planned_minutes, r.actual_minutes, r.submitted_at, r.reviewed_at])];
      break;
    }
  }
  rows.unshift([`# COMPETE VIX — ${tipo} · período ${start} a ${end} · corte ${cutoff} · gerado em ${zonedParts(new Date()).date} ${zonedParts(new Date()).time} (America/Sao_Paulo) · dados conforme permissões do usuário`]);
  return new NextResponse(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="compete-vix-${tipo}-${start}_a_${end}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
