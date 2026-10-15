"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { cancelByCustomer, type Result } from "@/lib/reservation/service";

export async function cancelMyReservation(id: string): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "ログインしてください" };
  const res = await cancelByCustomer(user.id, id);
  revalidatePath("/mypage/reservations");
  return res;
}
