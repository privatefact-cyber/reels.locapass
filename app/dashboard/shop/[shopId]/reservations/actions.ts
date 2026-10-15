"use server";

import { revalidatePath } from "next/cache";
import { getShopForManager } from "@/lib/locapass-dashboard/current-shop";
import { respondReservation, settleReservation, type Result } from "@/lib/reservation/service";

async function guard(shopId: string): Promise<boolean> {
  return !!(await getShopForManager(shopId));
}

export async function respondAction(shopId: string, id: string, accept: boolean, message: string | null): Promise<Result> {
  if (!(await guard(shopId))) return { ok: false, error: "権限がありません" };
  const r = await respondReservation(shopId, id, accept, message);
  revalidatePath(`/dashboard/shop/${shopId}/reservations`);
  return r;
}

export async function settleAction(shopId: string, id: string, kind: "arrived" | "applied" | "no_show"): Promise<Result> {
  if (!(await guard(shopId))) return { ok: false, error: "権限がありません" };
  const r = await settleReservation(shopId, id, kind);
  revalidatePath(`/dashboard/shop/${shopId}/reservations`);
  return r;
}
