"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { dbFailure, success, type FormState } from "@/lib/forms";

export async function markAllRead(): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
  if (error) return dbFailure(error);
  revalidatePath("/", "layout");
  return success("Notificações marcadas como lidas.");
}
