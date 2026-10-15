"use server";

import { createClient } from "@/lib/supabase/server";
import { createReservation, type CreateInput, type Result } from "@/lib/reservation/service";

export async function submitReservation(input: CreateInput): Promise<Result<{ id: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "ログインしてください" };
  return createReservation(user.id, input);
}
