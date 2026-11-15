import { createAdminClient } from "@/lib/supabase/admin";

export type AiProfile = { name: string; avatarUrl: string | null };

/**
 * 店舗AIコンシェルジュの「顔」。次のどちらかを、店舗が選び、本人の承諾が確認済みのときだけ返す。
 *  - staff : 店長などスタッフの写真(店舗のスタッフ1人)
 *  - custom: 店舗が設定したキャラクターの画像(アップロードした画像)
 * 未設定・承諾の確認なし・スタッフが退会しているときは null(会話画面は、AIのアイコンだけを出す)。
 * 公開側からは読めない列なので、サーバーの権限で読む。
 */
export async function getAiProfile(shopId: string): Promise<AiProfile | null> {
  const db = createAdminClient() as any;
  const { data: shop } = await db.from("locapass_shops").select("name, ai_avatar_kind, ai_avatar_staff_id, ai_avatar_image_url, ai_avatar_consent").eq("id", shopId).maybeSingle();
  if (!shop || !shop.ai_avatar_consent) return null;
  if (shop.ai_avatar_kind === "custom" && typeof shop.ai_avatar_image_url === "string" && /^https:\/\//.test(shop.ai_avatar_image_url)) {
    return { name: "", avatarUrl: shop.ai_avatar_image_url };
  }
  if (shop.ai_avatar_kind === "staff" && shop.ai_avatar_staff_id) {
    const { data: staff } = await db.from("locapass_shop_staff_members").select("name, avatar_url").eq("id", shop.ai_avatar_staff_id).eq("shop_id", shopId).is("deleted_at", null).maybeSingle();
    if (!staff) return null;
    return { name: String(staff.name ?? "").slice(0, 30), avatarUrl: (staff.avatar_url as string | null) ?? null };
  }
  return null;
}
