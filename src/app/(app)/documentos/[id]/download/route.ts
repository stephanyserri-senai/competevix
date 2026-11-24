import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/**
 * Download autorizado: a leitura do registro passa pelo RLS e a URL assinada só é emitida
 * se a política do Storage permitir. Validade curta (60 s), sem URL pública.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/documentos/[id]/download">) {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return new NextResponse("Não encontrado", { status: 404 });
  const supabase = await createClient();
  const { data: doc } = await supabase.from("documents").select("storage_path, original_name").eq("id", id).maybeSingle();
  if (!doc) return new NextResponse("Não encontrado", { status: 404 });
  const { data, error } = await supabase.storage
    .from("documentos")
    .createSignedUrl(doc.storage_path, 60, { download: doc.original_name });
  if (error || !data) return new NextResponse("Não encontrado", { status: 404 });
  return NextResponse.redirect(data.signedUrl, { headers: { "Cache-Control": "no-store" } });
}
