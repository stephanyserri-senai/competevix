import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { buildIcs } from "@/features/agenda/domain";
import { loadAgenda } from "@/features/agenda/queries";

/** Exportação iCalendar (RF04). Usa a sessão do usuário: só exporta o que o RLS permite ver. */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const programa = url.searchParams.get("programa");
  const equipe = url.searchParams.get("equipe");
  if (!z.uuid().safeParse(programa).success || (equipe && !z.uuid().safeParse(equipe).success)) {
    return new NextResponse("Parâmetros inválidos", { status: 400 });
  }
  const supabase = await createClient();
  const now = new Date();
  const { events, exceptions } = await loadAgenda(supabase, {
    programIds: [programa!],
    teamId: equipe,
    rangeStart: new Date(now.getTime() - 90 * 86400000),
    rangeEnd: new Date(now.getTime() + 400 * 86400000),
  });
  const ics = buildIcs(events, exceptions, { calendarName: "COMPETE VIX", host: url.host });
  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="compete-vix-agenda.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
