"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/require-admin";

/**
 * locapass_shops用の公開/非公開切り替え。portal_admin は担当ポータルの店舗のみ、
 * super_admin は全ポータル操作可(requireAdminのportalIdsがnullかどうかで判定)。
 * DB側のRLS(locapass_is_portal_admin)でも二重に保護されている。
 * locapass_shops.status は draft / active / suspended のみ許可されるため、非公開は suspended にする。
 */
export async function setLocapassShopStatus(shopId: string, status: "active" | "suspended") {
  const scope = await requireAdmin();
  const supabase = await createClient();

  let query = supabase.from("locapass_shops").update({ status }).eq("id", shopId);
  if (scope.portalIds !== null) {
    query = query.in("portal_id", scope.portalIds);
  }
  const { data, error } = await query.select("id");

  if (error) throw new Error(`店舗の状態変更に失敗しました: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error("店舗の状態変更に失敗しました(対象の店舗が見つからないか、権限がありません)");
  }

  revalidatePath("/admin");
}
