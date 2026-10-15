"use server";

import { revalidatePath } from "next/cache";
import { getShopForManager } from "@/lib/locapass-dashboard/current-shop";
import { createClient } from "@/lib/supabase/server";
import { FREE_CANCEL_CHOICES } from "@/lib/reservation/config";
import { respondReservation, settleReservation, type Result, type SettleKind } from "@/lib/reservation/service";

async function guard(shopId: string): Promise<boolean> {
  return !!(await getShopForManager(shopId));
}

export async function respondAction(shopId: string, id: string, accept: boolean, message: string | null): Promise<Result> {
  if (!(await guard(shopId))) return { ok: false, error: "権限がありません" };
  const r = await respondReservation(shopId, id, accept, message);
  revalidatePath(`/dashboard/shop/${shopId}/reservations`);
  return r;
}

export async function settleAction(shopId: string, id: string, kind: SettleKind): Promise<Result<{ warning?: string }>> {
  if (!(await guard(shopId))) return { ok: false, error: "権限がありません" };
  const r = await settleReservation(shopId, id, kind);
  revalidatePath(`/dashboard/shop/${shopId}/reservations`);
  return r;
}

/** 無料でお取り消しできる期限(来店のN時間前まで)を、お店ごとに設定する。 */
export async function updatePolicyAction(shopId: string, hours: number): Promise<Result> {
  if (!(await guard(shopId))) return { ok: false, error: "権限がありません" };
  if (!(FREE_CANCEL_CHOICES as readonly number[]).includes(hours)) return { ok: false, error: "選べない値です" };
  const supabase = await createClient();
  // RLSで0件更新でもエラーにならないため、.select()で実際に更新できたか確認する。
  const { data, error } = await (supabase as any).from("locapass_shops").update({ reservation_free_cancel_hours: hours }).eq("id", shopId).select("id");
  if (error || !data?.length) return { ok: false, error: "保存できませんでした" };
  revalidatePath(`/dashboard/shop/${shopId}/reservations`);
  return { ok: true };
}
