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

export type ShopOptionRow = { shopId: string; name: string; sub: string | null; enabled: Record<string, boolean> };

/** 運営者が触れる店舗だけを読む(ルート管理者は全店舗、ポータル管理者は自分のポータルの店舗だけ)。範囲外が混ざっていたら止める。 */
async function readRowsInScope(admin: any, scope: { portalIds: number[] | null }, shopIds: string[]): Promise<ShopOptionRow[]> {
  const { data } = await admin.from("locapass_shops").select(`id, name, area, portal_id, ${OPTION_COLUMNS}`).in("id", shopIds);
  const rows = (data ?? []) as any[];
  if (scope.portalIds !== null && rows.some((r) => !scope.portalIds!.includes(r.portal_id))) throw new Error("この店舗を操作する権限がありません");
  const byId = new Map<string, any>(rows.map((r) => [r.id as string, r]));
  return shopIds.flatMap((id) => {
    const r = byId.get(id);
    if (!r) return [];
    return [{ shopId: id, name: r.name as string, sub: (r.area as string | null) ?? null, enabled: Object.fromEntries(statesFromRow(r).map((st) => [st.key, st.enabled])) }];
  });
}

/** 選んだ複数の店舗の、いまのオプション状態を読む(運営者だけ)。 */
export async function getShopsOptionStates(shopIds: string[]): Promise<ShopOptionRow[]> {
  const scope = await requireAdmin();
  const ids = [...new Set(shopIds)].slice(0, 200);
  if (ids.length === 0) return [];
  return readRowsInScope(createAdminClient() as any, scope, ids);
}

/**
 * 選んだ複数の店舗に、オプションの変更をまとめて反映する(運営者だけ)。
 * 保存したあとに、データベースを読み直した「本当の状態」を返す(画面で「反映された」ことを確認できるようにするため)。
 */
export async function applyShopOptions(shopIds: string[], changes: { key: string; enabled: boolean }[]): Promise<ShopOptionRow[]> {
  const scope = await requireAdmin();
  const ids = [...new Set(shopIds)].slice(0, 200);
  if (ids.length === 0) throw new Error("店舗を選んでください");
  if (changes.length === 0) throw new Error("変更するオプションを選んでください");
  const admin = createAdminClient() as any;
  await readRowsInScope(admin, scope, ids); // 権限の確認(範囲外の店舗が混ざっていたら止める)
  for (const c of changes) {
    const def = optionDef(c.key);
    if (!def) throw new Error("不明なオプションです");
    // 0件でもエラーにならないので.select()で件数を確認する。
    const { data, error } = await admin.from("locapass_shops").update({ [def.column]: c.enabled }).in("id", ids).select("id");
    if (error) throw new Error(`保存に失敗しました: ${error.message}`);
    if ((data?.length ?? 0) !== ids.length) throw new Error(`一部の店舗に保存できませんでした(${data?.length ?? 0}/${ids.length}店舗)`);
  }
  for (const id of ids) revalidatePath(`/dashboard/shop/${id}`, "layout");
  revalidatePath("/map");
  return readRowsInScope(admin, scope, ids);
}
