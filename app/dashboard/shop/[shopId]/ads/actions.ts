"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdBanner } from "@/lib/recommend/adBanner";
import { translateFields } from "@/lib/i18n/contentTranslation";
import { containsNgWord } from "@/lib/reels/ngWords";
import { shopPath } from "@/lib/locapass/publicUrls";

const MAX_CARDS_PER_SHOP = 3;
/** ADオプションを使えないプラン。 */
const EXCLUDED_PLANS = ["free", "lite"];

/** 呼び出した人がこの店の管理者で、ADオプションが使える店かを確認する。 */
async function authorize(shopId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("ログインが必要です");
  const { data: canManage } = await supabase.rpc("locapass_is_shop_admin", { p_shop_id: shopId });
  if (!canManage) throw new Error("この店舗を操作する権限がありません");
  const admin = createAdminClient() as any;
  const { data: shop } = await admin
    .from("locapass_shops")
    .select("id, name, slug, plan, ad_option_enabled, portal:locapass_portals ( slug )")
    .eq("id", shopId)
    .maybeSingle();
  if (!shop) throw new Error("店舗が見つかりません");
  if (!shop.ad_option_enabled || EXCLUDED_PLANS.includes(shop.plan)) throw new Error("ADオプションが有効ではありません");
  const portal = Array.isArray(shop.portal) ? shop.portal[0] : shop.portal;
  const ownPath = portal?.slug ? shopPath(portal.slug as string, shop.slug as string) : "/";
  return { admin, shop, ownPath };
}

type Parsed = { label: string; headline: string; body: string | null; cta: string; link_url: string; same_category_only: boolean };

function parse(formData: FormData, ownPath: string): Parsed {
  const headline = String(formData.get("headline") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim() || null;
  const cta = String(formData.get("cta") ?? "").trim() || "お店の詳細を見る";
  const rawLink = String(formData.get("linkUrl") ?? "").trim();
  if (!headline) throw new Error("見出しを入力してください");
  if (headline.length > 80) throw new Error("見出しは80文字以内にしてください");
  if (body && body.length > 200) throw new Error("説明は200文字以内にしてください");
  if (cta.length > 30) throw new Error("ボタンの文言は30文字以内にしてください");
  if ([headline, body ?? "", cta].some((t) => containsNgWord(t))) throw new Error("使えない言葉が含まれています");
  // リンク先は、空欄ならお店のページ。外部は https のURLだけ。
  const link_url = rawLink || ownPath;
  if (rawLink && !/^https:\/\//.test(rawLink)) throw new Error("リンク先は https:// から始まるURLにしてください(空欄ならお店のページになります)");
  return { label: "PR", headline, body, cta, link_url, same_category_only: formData.get("sameCategory") === "on" };
}

async function uploadImage(admin: any, shopId: string, file: FormDataEntryValue | null): Promise<string | null> {
  if (!(file instanceof File) || file.size === 0) return null;
  // 規格(サイズ・形式・容量)に合わない画像は弾く。
  await assertAdBanner(file);
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "jpg";
  const path = `cards/${shopId}/${Date.now()}.${ext}`;
  const { error } = await admin.storage.from("locapass-ads").upload(path, file, { contentType: file.type });
  if (error) throw new Error(`画像のアップロードに失敗しました: ${error.message}`);
  return admin.storage.from("locapass-ads").getPublicUrl(path).data.publicUrl as string;
}

async function translate(p: Pick<Parsed, "label" | "headline" | "body" | "cta">) {
  try {
    return await translateFields({ label: p.label, headline: p.headline, body: p.body, cta: p.cta }, "ja");
  } catch {
    return null;
  }
}

function refresh(shopId: string) {
  revalidatePath(`/dashboard/shop/${shopId}/ads`);
  revalidatePath("/admin/ad-cards");
}

export async function createShopAdCard(shopId: string, formData: FormData) {
  const { admin, shop, ownPath } = await authorize(shopId);
  const p = parse(formData, ownPath);
  const { count } = await admin.from("locapass_ad_cards").select("id", { count: "exact", head: true }).eq("shop_id", shopId);
  if ((count ?? 0) >= MAX_CARDS_PER_SHOP) throw new Error(`登録できるカードは${MAX_CARDS_PER_SHOP}枚までです。不要なカードを削除してください`);
  const image_url = await uploadImage(admin, shopId, formData.get("image"));
  const translations = await translate(p);
  const { error } = await admin.from("locapass_ad_cards").insert({
    ...p,
    title: `${shop.name}`.slice(0, 100),
    placement: "both",
    shop_id: shopId,
    status: "pending", // 運営の承認後に配信される
    is_active: true,
    sort_order: 100,
    image_url,
    translations,
  });
  if (error) throw new Error(`登録に失敗しました: ${error.message}`);
  refresh(shopId);
}

/** 内容を直すと、もう一度承認が必要になる(承認済みの内容と違うものが出ないように)。 */
export async function updateShopAdCard(shopId: string, id: string, formData: FormData) {
  const { admin, ownPath } = await authorize(shopId);
  const p = parse(formData, ownPath);
  const newImage = await uploadImage(admin, shopId, formData.get("image"));
  const removeImage = formData.get("removeImage") === "on";
  const translations = await translate(p);
  const patch: Record<string, unknown> = { ...p, translations, status: "pending", reject_reason: null, updated_at: new Date().toISOString() };
  if (newImage) patch.image_url = newImage;
  else if (removeImage) patch.image_url = null;
  const { data, error } = await admin.from("locapass_ad_cards").update(patch).eq("id", id).eq("shop_id", shopId).select("id");
  if (error) throw new Error(`更新に失敗しました: ${error.message}`);
  if (!data?.length) throw new Error("カードが見つかりません");
  refresh(shopId);
}

export async function setShopAdCardActive(shopId: string, id: string, isActive: boolean) {
  const { admin } = await authorize(shopId);
  const { data, error } = await admin.from("locapass_ad_cards").update({ is_active: isActive, updated_at: new Date().toISOString() }).eq("id", id).eq("shop_id", shopId).select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("カードが見つかりません");
  refresh(shopId);
}

export async function deleteShopAdCard(shopId: string, id: string) {
  const { admin } = await authorize(shopId);
  const { error } = await admin.from("locapass_ad_cards").delete().eq("id", id).eq("shop_id", shopId);
  if (error) throw new Error(error.message);
  refresh(shopId);
}
