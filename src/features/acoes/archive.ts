"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { dbFailure, success, type FormState } from "@/lib/forms";

export async function setArchivedAction(id: string, archived: boolean): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("actions")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id)
    .select("id")
    .single();
  if (error) return dbFailure(error);
  revalidatePath(`/acoes/${id}`);
  revalidatePath("/acoes");
  return success(archived ? "Ação arquivada." : "Ação reativada.");
}
