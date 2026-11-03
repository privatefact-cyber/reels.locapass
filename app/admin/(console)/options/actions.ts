"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { OPTION_COLUMNS, optionDef, statesFromRow, type ShopOptionState } from "@/lib/shop-options";

/** 運営者が触れる店舗か(ルート管理者は全店舗、ポータル管理者は自分のポータルの店舗だけ)。 */
async function assertShopInScope(shopId: string) {
  const scope = await requireAdmin();
  const admin = createAdminClient() as any;
  const { data: shop } = await admin.from("locapass_shops").select(`id, portal_id, ${OPTION_COLUMNS}`).eq("id", shopId).maybeSingle();
  if (!shop) throw new Error("店舗が見つかりません");
  if (scope.portalIds !== null && !scope.portalIds.includes(shop.portal_id)) throw new Error("この店舗を操作する権限がありません");
  return { admin, shop };
}

/** 店舗名で検索(上位30件)。 */
export async function searchShopsForOptions(q: string) {
  const scope = await requireAdmin();
  const term = q.replace(/[%_,()\\]/g, " ").trim();
  let query = (createAdminClient() as any)
    .from("locapass_shops")
    .select("id, name, portal:locapass_portals ( name )")
    .eq("status", "active")
    .order("name")
    .limit(30);
  if (scope.portalIds !== null) query = query.in("portal_id", scope.portalIds);
  if (term) query = query.ilike("name", `%${term}%`);
  const { data } = await query;
  return ((data ?? []) as { id: string; name: string; portal: { name: string } | { name: string }[] | null }[]).map((s) => {
    const portal = Array.isArray(s.portal) ? s.portal[0] : s.portal;
    return { id: s.id, name: s.name, sub: portal?.name ?? null, embedEnabled: false };
  });
}

export async function getShopOptionStates(shopId: string): Promise<ShopOptionState[]> {
  const { shop } = await assertShopInScope(shopId);
  return statesFromRow(shop);
}

/** オプションのオン/オフを保存する(運営者だけ)。保存後の状態を返す。 */
export async function setShopOption(shopId: string, key: string, enabled: boolean): Promise<ShopOptionState[]> {
  const def = optionDef(key);
  if (!def) throw new Error("不明なオプションです");
  const { admin } = await assertShopInScope(shopId);
  // 0件でもエラーにならないので.select()で確認する。
  const { data, error } = await admin.from("locapass_shops").update({ [def.column]: enabled }).eq("id", shopId).select(OPTION_COLUMNS);
  if (error) throw new Error(`保存に失敗しました: ${error.message}`);
  if (!data?.length) throw new Error("保存できませんでした");
  revalidatePath(`/dashboard/shop/${shopId}`, "layout");
  return statesFromRow(data[0]);
}
