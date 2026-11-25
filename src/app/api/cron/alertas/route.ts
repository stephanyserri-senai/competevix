import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Rotina agendada (Vercel Cron) que gera/resolve alertas internos de forma idempotente.
 * Protegida por CRON_SECRET; usa a chave secreta apenas para executar refresh_alerts().
 * Sem envio externo (e-mail/WhatsApp) no MVP (PRD §9).
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (!secret || auth.length !== expected.length || !timingSafeEqual(Buffer.from(auth), Buffer.from(expected))) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }
  const admin = createAdminClient();
  const [base, ws, ops, cad] = await Promise.all([
    admin.rpc("refresh_alerts"), admin.rpc("refresh_alerts_ws"), admin.rpc("refresh_alerts_ops"), admin.rpc("refresh_alerts_cadence"),
  ]);
  if (base.error || ws.error || ops.error || cad.error) return NextResponse.json({ error: "falha ao atualizar alertas" }, { status: 500 });
  return NextResponse.json({ ok: true, result: { geral: base.data?.[0] ?? null, worldskills: ws.data?.[0] ?? null, operacao: ops.data?.[0] ?? null, cadencias: cad.data?.[0] ?? null } });
}
