"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ImportError, downloadImportImage, previewShopImport } from "@/lib/shop/importFromWebsite";
import { refreshShopTranslations, translatePriceItemNames } from "@/lib/shop/shopTranslations";
import type { ApplyImportInput, ApplyImportResult, PreviewImportResult } from "@/lib/shop/importTypes";

/**
 * 公式サイトからの取り込み(本家 app/dashboard/shop/importActions.ts)を locapass_shops /
 * locapass_shop_price_items / locapass-reels バケットにつないだ版。操作できるのはその店舗の shop_admin 以上。
 */
async function requireShopAdmin(shopId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: ok } = await supabase.rpc("locapass_is_shop_admin", { p_shop_id: shopId });
  return ok ? supabase : null;
}

/** 公式サイトのURLから取り込み候補を読み取る。DBには何も書かない(店舗が確認してから applyImportAction で反映)。 */
export async function previewImportAction(shopId: string, url: string): Promise<PreviewImportResult> {
  if (!(await requireShopAdmin(shopId))) return { ok: false, error: "この店舗を編集する権限がありません" };
  try {
    return { ok: true, preview: await previewShopImport(url) };
  } catch (e) {
    if (!(e instanceof ImportError)) console.error("サイトの取り込みプレビューに失敗しました:", e);
    return {
      ok: false,
      error: e instanceof ImportError ? e.message : "読み込みに失敗しました。時間をおいて再度お試しください",
    };
  }
}

const clip = (v: string | null, max: number) => (v && v.trim() ? v.trim().slice(0, max) : null);

/** 店舗が選んだ項目だけを店舗ページに反映する。 */
export async function applyImportAction(shopId: string, input: ApplyImportInput): Promise<ApplyImportResult> {
  const supabase = await requireShopAdmin(shopId);
  if (!supabase) return { ok: false, error: "この店舗を編集する権限がありません" };
  if (!input.rightsConfirmed) {
    return { ok: false, error: "写真・文章を使う権利があることの確認にチェックを入れてください" };
  }

  const applied: string[] = [];
  const patch: {
    description?: string;
    business_hours?: string;
    tel?: string;
    cover_url?: string;
    hero_media_url?: string;
    hero_media_type?: string;
  } = {};

  const description = clip(input.description, 400);
  const businessHours = clip(input.businessHours, 200);
  const phone = clip(input.phone, 30);
  if (description) {
    patch.description = description;
    applied.push("お店紹介文");
  }
  if (businessHours) {
    patch.business_hours = businessHours;
    applied.push("営業時間");
  }
  if (phone) {
    patch.tel = phone;
    applied.push("電話番号");
  }

  // 写真はクライアントから届いたURLをそのまま使わず、サーバーで取り直して自店舗のストレージに置く
  // (宛先の検査はdownloadImportImageの中で行う。元サイトの画像が消えても表示が壊れないようにする意味もある)。
  const rehost = async (src: string, label: string) => {
    const image = await downloadImportImage(src);
    const path = `${shopId}/imported-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${image.ext}`;
    const { error } = await supabase.storage
      .from("locapass-reels")
      .upload(path, image.bytes, { contentType: image.contentType });
    if (error) throw new ImportError(`${label}の保存に失敗しました: ${error.message}`);
    return supabase.storage.from("locapass-reels").getPublicUrl(path).data.publicUrl;
  };

  try {
    if (input.coverImageUrl) {
      patch.cover_url = await rehost(input.coverImageUrl, "メイン画像");
      applied.push("メイン画像");
    }
    if (input.heroImageUrl) {
      patch.hero_media_url = await rehost(input.heroImageUrl, "トップ画像");
      patch.hero_media_type = "image";
      applied.push("トップ画像");
    }
  } catch (e) {
    return { ok: false, error: e instanceof ImportError ? e.message : "写真の取り込みに失敗しました" };
  }

  if (Object.keys(patch).length > 0) {
    const { data, error } = await supabase.from("locapass_shops").update(patch).eq("id", shopId).select("id");
    if (error) return { ok: false, error: `店舗情報の更新に失敗しました: ${error.message}` };
    if (!data?.length) return { ok: false, error: "店舗情報の更新に失敗しました(権限をご確認ください)" };
  }

  // 料金表は、同じ名前の項目が既にあれば重複させない。
  const candidates = (input.priceItems ?? [])
    .map((p) => ({
      name: String(p.name ?? "").trim().slice(0, 60),
      duration_minutes: Number.isInteger(p.duration_minutes) && (p.duration_minutes ?? 0) > 0 ? p.duration_minutes : null,
      price: Number(p.price),
    }))
    .filter((p) => p.name && Number.isInteger(p.price) && p.price > 0 && p.price < 10_000_000)
    .slice(0, 20);

  if (candidates.length > 0) {
    const { data: existing } = await supabase
      .from("locapass_shop_price_items")
      .select("name, display_order")
      .eq("shop_id", shopId);
    const existingNames = new Set((existing ?? []).map((e) => e.name));
    const toInsert = candidates.filter((c) => !existingNames.has(c.name));
    if (toInsert.length > 0) {
      const startOrder = Math.max(0, ...(existing ?? []).map((e) => e.display_order ?? 0)) + 1;
      const nameTranslations = await translatePriceItemNames(toInsert.map((c) => c.name));
      const { error } = await supabase.from("locapass_shop_price_items").insert(
        toInsert.map((c, i) => ({
          shop_id: shopId,
          name: c.name,
          duration_minutes: c.duration_minutes,
          price: c.price,
          display_order: startOrder + i,
          name_translations: nameTranslations[i] ?? {},
        })),
      );
      if (error) return { ok: false, error: `料金表の登録に失敗しました: ${error.message}` };
      applied.push(`料金表 ${toInsert.length}件`);
    }
  }

  if (applied.length === 0) return { ok: false, error: "反映する項目が選ばれていません" };

  if (patch.description || patch.business_hours) {
    await refreshShopTranslations(supabase, shopId);
  }

  revalidatePath(`/dashboard/shop/${shopId}`);
  revalidatePath(`/images/no-image.jpg
  revalidatePath("/");
  return { ok: true, applied };
}
