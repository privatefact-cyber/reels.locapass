"use server";

import { revalidatePath } from "next/cache";
import { requireRootAdmin } from "@/lib/admin/require-admin";
import { petAdmin, PET_BUCKET } from "@/lib/pet/db";

/** 運営: 迷子のお知らせ/見つけました通報を非表示・再表示する */
export async function setPetReportHidden(type: "lost" | "found", id: string, hidden: boolean) {
  await requireRootAdmin();
  const table = type === "lost" ? "locapass_pet_lost_reports" : "locapass_pet_found_reports";
  const { data, error } = await petAdmin()
    .from(table)
    .update({ hidden_at: hidden ? new Date().toISOString() : null })
    .eq("id", id)
    .select("id");
  if (error || !data?.length) throw new Error("更新できませんでした");
  revalidatePath("/admin/pets");
  revalidatePath("/pet", "layout");
}

/** 運営: 見つけました通報を写真ごと削除する(迷子のお知らせは飼い主のものなので削除せず、非表示で対応する) */
export async function deleteFoundReportAsAdmin(id: string) {
  await requireRootAdmin();
  const admin = petAdmin();
  const { data } = await admin.from("locapass_pet_found_reports").delete().eq("id", id).select("photo_path");
  if (!data?.length) throw new Error("削除できませんでした");
  const photo = data[0].photo_path as string | null;
  if (photo) await admin.storage.from(PET_BUCKET).remove([photo]);
  await admin.from("locapass_pet_flags").delete().eq("target_type", "found").eq("target_id", id);
  revalidatePath("/admin/pets");
  revalidatePath("/pet", "layout");
}

/** 運営: 報告を確認済みにする(報告を消す) */
export async function clearPetFlags(type: "lost" | "found", id: string) {
  await requireRootAdmin();
  await petAdmin().from("locapass_pet_flags").delete().eq("target_type", type).eq("target_id", id);
  revalidatePath("/admin/pets");
}
