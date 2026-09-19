"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, requireRootAdmin } from "@/lib/admin/require-admin";

export async function stopImpersonation() {
  await requireRootAdmin();
  const supabase = await createClient();
  await supabase.rpc("admin_stop_impersonation");
  redirect("/admin");
}

/**
 * トップページのFEATURED枠(提携店舗特集)の表示可否。データ(featured_rank・取り込んだ
 * 紹介文/料金)は消さず、表示だけを止める。RLSで運営者以外は更新できない(00077参照)。
 */
export async function setFeaturedSectionEnabled(enabled: boolean) {
  await requireRootAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("platform_settings")
    .update({ featured_section_enabled: enabled, updated_at: new Date().toISOString() })
    .eq("id", true)
    .select("id");

  if (error) throw new Error(`FEATURED枠の設定変更に失敗しました: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error("FEATURED枠の設定変更に失敗しました(権限をご確認ください)");
  }

  revalidatePath("/admin");
  revalidatePath("/");
}

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
