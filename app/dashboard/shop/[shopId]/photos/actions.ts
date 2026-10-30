"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isPresetId } from "@/lib/photowall/presets";

/**
 * 店舗ページの写真の見せ方を上書きする。
 * 権限の確認はDB関数(locapass_set_photo_shop_link)が行う:
 *  - hide(この店舗では出さない)/ clear(戻す) … 店舗管理者以上
 *  - attach(この店舗に表示する) / attachの解除 … ポータル管理者以上
 * 写真そのものは変えない(みんなの写真の一覧やマップには、そのまま出る)。
 */
export async function setPhotoShopLink(shopId: string, postId: string, mode: "attach" | "hide" | "clear") {
  const supabase = await createClient();
  const { error } = await supabase.rpc("locapass_set_photo_shop_link" as never, {
    p_post_id: postId,
    p_shop_id: shopId,
    p_mode: mode,
  } as never);
  if (error) {
    if (/forbidden/.test(error.message)) throw new Error("この操作をする権限がありません");
    throw new Error("保存に失敗しました");
  }
  const { data: shop } = await supabase
    .from("locapass_shops")
    .select("slug, locapass_portals(slug)")
    .eq("id", shopId)
    .maybeSingle();
  const portal = Array.isArray((shop as any)?.locapass_portals) ? (shop as any).locapass_portals[0] : (shop as any)?.locapass_portals;
  if (shop?.slug && portal?.slug) {
    revalidatePath(`/${portal.slug}/shops/${shop.slug}`);
    revalidatePath(`/${portal.slug}/shops/${shop.slug}/photos`);
  }
  revalidatePath(`/dashboard/shop/${shopId}/photos`);
}

/**
 * 店舗ページの背景「写真の壁」のオン/オフと、ダミー写真のプリセットを保存する(店舗管理者以上)。
 * RLSで0件更新になってもエラーにならないので、更新された行が返るかで成否を確かめる。
 */
export async function updateShopPhotoWall(shopId: string, enabled: boolean, preset: string | null) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("ログインが必要です");
  if (preset !== null && !isPresetId(preset)) throw new Error("プリセットが正しくありません");
  const { data, error } = await (supabase as any)
    .from("locapass_shops")
    .update({ photo_wall_enabled: enabled, photo_wall_preset: preset })
    .eq("id", shopId)
    .select("slug, locapass_portals(slug)");
  if (error) throw new Error("保存に失敗しました");
  if (!data || data.length === 0) throw new Error("この操作をする権限がありません");
  const shop = data[0];
  const portal = Array.isArray(shop.locapass_portals) ? shop.locapass_portals[0] : shop.locapass_portals;
  if (shop.slug && portal?.slug) revalidatePath(`/${portal.slug}/shops/${shop.slug}`);
  revalidatePath(`/dashboard/shop/${shopId}/photos`);
}
