"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { translateAddressToEnglish } from "@/lib/map/translateAddress";
import { needsTranslation, translateFields } from "@/lib/i18n/contentTranslation";
import type { Json } from "@/types/supabase";
import { translateEventText, translatePriceItemNames } from "@/lib/shop/shopTranslations";

/**
 * LUXELA本家(app/dashboard/shop/actions.ts)の店舗情報画面をlocapass_shopsにつないだ版。
 * エリア・SNS・LINE QR・トップ画像/動画・利用説明は00082、料金情報は00083で追加した列に保存する(列名は本家と同じ)。
 */

/**
 * この店舗を管理できるか(super_admin / 担当portal_admin / その店舗のshop_admin)を確認する。
 * 判定はDBの locapass_is_shop_admin と同じ(RLSでも同じ条件で書き込みが制限される)。
 */
async function requireShopAccess(shopId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("ログインが必要です");
  const { data: canManage } = await supabase.rpc("locapass_is_shop_admin", { p_shop_id: shopId });
  if (!canManage) throw new Error("この店舗を編集する権限がありません");
  return supabase;
}

function revalidateShop(shopId: string) {
  revalidatePath(`/dashboard/shop/${shopId}`);
  revalidatePath(`/images/no-image.jpg
  revalidatePath("/admin");
}

export async function updateShopProfile(shopId: string, formData: FormData) {
  const supabase = await requireShopAccess(shopId);

  const name = String(formData.get("name") ?? "").trim();
  const genre = String(formData.get("genre") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const businessHours = String(formData.get("business_hours") ?? "").trim() || null;
  const description = String(formData.get("description") ?? "").trim() || null;
  const coverImageUrl = String(formData.get("cover_image_url") ?? "").trim();
  const websiteUrl = String(formData.get("website_url") ?? "").trim();
  const lineUrl = String(formData.get("line_url") ?? "").trim();
  const area = String(formData.get("area") ?? "").trim();
  const snsX = String(formData.get("sns_x") ?? "").trim();
  const snsInstagram = String(formData.get("sns_instagram") ?? "").trim();
  const snsLine = String(formData.get("sns_line") ?? "").trim();
  const lineQrImageUrl = String(formData.get("line_qr_image_url") ?? "").trim();
  const heroMediaUrl = String(formData.get("hero_media_url") ?? "").trim();
  const heroMediaType = String(formData.get("hero_media_url_type") ?? "").trim() === "video" ? "video" : "image";
  const usageNotes = String(formData.get("usage_notes") ?? "").trim() || null;
  const priceInfo = String(formData.get("price_info") ?? "").trim() || null;

  if (!name) throw new Error("店舗名は必須です");

  // 住所が変わったら英語表記を裏で作り直す(本家shops.address_enと同じ方式)。
  // 翻訳が落ちても店舗情報の保存自体は通す。
  const { data: currentShop } = await supabase
    .from("locapass_shops")
    .select("address, address_en, tagline, translations")
    .eq("id", shopId)
    .maybeSingle();

  let addressEnPatch: { address_en: string | null } | Record<string, never> = {};
  if (!address) {
    addressEnPatch = { address_en: null };
  } else if (address !== (currentShop?.address ?? "") || !currentShop?.address_en) {
    try {
      const translated = await translateAddressToEnglish(address);
      if (translated) addressEnPatch = { address_en: translated };
    } catch (e) {
      console.error("住所の英語表記の生成に失敗しました:", e);
    }
  }

  let translationsPatch: { translations: Json } | Record<string, never> = {};
  const translationFields = {
    description,
    tagline: currentShop?.tagline ?? null,
    business_hours: businessHours,
    price_info: priceInfo,
    usage_notes: usageNotes,
  };
  // 紹介文・営業時間・料金情報・利用説明などが変わっていたら、英語・中国語の翻訳を作り直す
  // (本家refreshShopTranslationsと同じ項目。変わっていなければ翻訳APIは呼ばない)。
  if (needsTranslation(translationFields, currentShop?.translations)) {
    try {
      const translations = await translateFields(translationFields);
      if (translations) translationsPatch = { translations: translations as unknown as Json };
    } catch (e) {
      console.error("店舗紹介文の翻訳に失敗しました:", e);
    }
  }

  const { data, error } = await supabase
    .from("locapass_shops")
    .update({
      name,
      category: genre || null,
      address: address || null,
      ...addressEnPatch,
      tel: phone || null,
      business_hours: businessHours,
      description,
      cover_url: coverImageUrl || null,
      url: websiteUrl || null,
      line_url: lineUrl || null,
      area: area || null,
      sns_links: {
        ...(snsX ? { x: snsX } : {}),
        ...(snsInstagram ? { instagram: snsInstagram } : {}),
        ...(snsLine ? { line: snsLine } : {}),
      },
      line_qr_image_url: lineQrImageUrl || null,
      hero_media_url: heroMediaUrl || null,
      ...(heroMediaUrl ? { hero_media_type: heroMediaType } : {}),
      usage_notes: usageNotes,
      price_info: priceInfo,
      ...translationsPatch,
    })
    .eq("id", shopId)
    .select("id");

  if (error) throw new Error(`店舗情報の更新に失敗しました: ${error.message}`);
  // RLSにより対象行が0件のまま「成功扱い」で返ってくるケースを検知する。
  if (!data || data.length === 0) {
    throw new Error("店舗情報の更新に失敗しました(対象の店舗が見つからないか、権限がありません)");
  }

  revalidateShop(shopId);
}

/** マップのピン位置を保存する(locapass_shopsのlat/lng)。 */
export async function updateShopPin(shopId: string, lat: number, lng: number) {
  let supabase;
  try {
    supabase = await requireShopAccess(shopId);
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "権限がありません" };
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { ok: false as const, error: "座標が不正です" };
  }

  const { data, error } = await supabase
    .from("locapass_shops")
    .update({ lat, lng })
    .eq("id", shopId)
    .select("id");

  if (error) return { ok: false as const, error: error.message };
  if (!data?.length) return { ok: false as const, error: "更新できませんでした(権限をご確認ください)" };

  revalidateShop(shopId);
  revalidatePath("/map");
  return { ok: true as const };
}

const MAX_GALLERY_IMAGES = 10;

/** 店舗紹介ギャラリーに1枚追加する(アップロード自体はクライアント側でstorageに直接行い、URLだけここで登録する)。 */
export async function addGalleryImage(shopId: string, url: string) {
  const supabase = await requireShopAccess(shopId);
  if (!url) throw new Error("画像URLがありません");

  const { data: current, error: fetchError } = await supabase
    .from("locapass_shops")
    .select("gallery_image_urls")
    .eq("id", shopId)
    .single();
  if (fetchError) throw new Error(`ギャラリーの取得に失敗しました: ${fetchError.message}`);

  const existing = current?.gallery_image_urls ?? [];
  if (existing.length >= MAX_GALLERY_IMAGES) {
    throw new Error(`ギャラリーは最大${MAX_GALLERY_IMAGES}枚までです`);
  }

  const { error } = await supabase
    .from("locapass_shops")
    .update({ gallery_image_urls: [...existing, url] })
    .eq("id", shopId);
  if (error) throw new Error(`ギャラリーへの追加に失敗しました: ${error.message}`);

  revalidateShop(shopId);
}

export async function deleteGalleryImage(shopId: string, url: string) {
  const supabase = await requireShopAccess(shopId);

  const { data: current, error: fetchError } = await supabase
    .from("locapass_shops")
    .select("gallery_image_urls")
    .eq("id", shopId)
    .single();
  if (fetchError) throw new Error(`ギャラリーの取得に失敗しました: ${fetchError.message}`);

  const existing = current?.gallery_image_urls ?? [];
  const { error } = await supabase
    .from("locapass_shops")
    .update({ gallery_image_urls: existing.filter((u) => u !== url) })
    .eq("id", shopId);
  if (error) throw new Error(`ギャラリーの削除に失敗しました: ${error.message}`);

  revalidateShop(shopId);
}

/** 店舗のリール(locapass_reels)を削除する。 */
export async function deleteReel(shopId: string, reelId: string) {
  const supabase = await requireShopAccess(shopId);
  const { data, error } = await supabase
    .from("locapass_reels")
    .delete()
    .eq("id", reelId)
    .eq("shop_id", shopId)
    .select("id");

  if (error || !data || data.length === 0) {
    throw new Error(`削除に失敗しました: ${error?.message ?? "対象が見つかりません"}`);
  }

  revalidatePath(`/dashboard/shop/${shopId}/reels`);
  revalidatePath("/");
}

// ---------- 料金表(本家 addPriceItem / deletePriceItem) ----------
export async function addPriceItem(shopId: string, formData: FormData) {
  const supabase = await requireShopAccess(shopId);

  const name = String(formData.get("name") ?? "").trim();
  const durationRaw = String(formData.get("duration_minutes") ?? "").trim();
  const priceRaw = String(formData.get("price") ?? "").trim();
  if (!name || !priceRaw) throw new Error("コース名と料金は必須です");

  const [nameTranslations] = await translatePriceItemNames([name]);
  const { error } = await supabase.from("locapass_shop_price_items").insert({
    shop_id: shopId,
    name,
    duration_minutes: durationRaw ? Number(durationRaw) : null,
    price: Number(priceRaw),
    name_translations: nameTranslations ?? {},
  });
  if (error) throw new Error(`料金項目の登録に失敗しました: ${error.message}`);
  revalidateShop(shopId);
}

export async function deletePriceItem(shopId: string, itemId: string) {
  const supabase = await requireShopAccess(shopId);
  const { data, error } = await supabase
    .from("locapass_shop_price_items")
    .delete()
    .eq("id", itemId)
    .eq("shop_id", shopId)
    .select("id");
  if (error) throw new Error(`料金項目の削除に失敗しました: ${error.message}`);
  if (!data || data.length === 0) throw new Error("料金項目の削除に失敗しました(対象が見つからないか、権限がありません)");
  revalidateShop(shopId);
}

// ---------- イベント(本家 addEvent / deleteEvent) ----------
/** "HH:MM" 形式の時刻文字列(15分刻み想定)を検証する。空文字は許可(時刻未指定)。 */
function parseTimeOfDay(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d{2}:\d{2}$/.test(trimmed)) throw new Error("時刻の形式が不正です");
  return trimmed;
}

/** 日付 + 時刻(JST)を timestamptz 用のISO文字列に変換する。時刻未指定時は fallbackTime を使う。 */
function toJstIso(date: string, time: string | null, fallbackTime: string): string | null {
  if (!date) return null;
  return `${date}T${time ?? fallbackTime}:00+09:00`;
}

export async function addEvent(shopId: string, formData: FormData) {
  const supabase = await requireShopAccess(shopId);

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const startDate = String(formData.get("start_date") ?? "").trim();
  const startTime = parseTimeOfDay(String(formData.get("start_time") ?? ""));
  const endDate = String(formData.get("end_date") ?? "").trim();
  const endTime = parseTimeOfDay(String(formData.get("end_time") ?? ""));
  const imageUrl = String(formData.get("image_url") ?? "").trim();
  const galleryUrlsRaw = String(formData.get("gallery_image_urls") ?? "").trim();

  if (!title) throw new Error("タイトルは必須です");
  if (!imageUrl) throw new Error("イベントリール用のサムネイル画像は必須です");
  if (endDate && !startDate) throw new Error("終了日を設定する場合は開始日も設定してください");

  const startsAt = toJstIso(startDate, startTime, "00:00");
  const endsAt = toJstIso(endDate, endTime, "23:45");
  if (startsAt && endsAt && endsAt < startsAt) {
    throw new Error("終了日時は開始日時より後に設定してください");
  }

  let galleryImageUrls: string[] = [];
  if (galleryUrlsRaw) {
    try {
      const parsed = JSON.parse(galleryUrlsRaw);
      if (Array.isArray(parsed)) galleryImageUrls = parsed.filter((u) => typeof u === "string");
    } catch {
      throw new Error("詳細ページ用画像の形式が不正です");
    }
  }

  const translations = await translateEventText(title, body || null);
  const { error } = await supabase.from("locapass_shop_events").insert({
    shop_id: shopId,
    title,
    body: body || null,
    starts_at: startsAt,
    ends_at: endsAt,
    image_url: imageUrl,
    gallery_image_urls: galleryImageUrls,
    translations,
  });
  if (error) throw new Error(`イベントの登録に失敗しました: ${error.message}`);
  revalidateShop(shopId);
  revalidatePath("/events");
}

export async function deleteEvent(shopId: string, eventId: string) {
  const supabase = await requireShopAccess(shopId);
  const { data, error } = await supabase
    .from("locapass_shop_events")
    .delete()
    .eq("id", eventId)
    .eq("shop_id", shopId)
    .select("id");
  if (error) throw new Error(`イベントの削除に失敗しました: ${error.message}`);
  if (!data || data.length === 0) throw new Error("イベントの削除に失敗しました(対象が見つからないか、権限がありません)");
  revalidateShop(shopId);
}

// ---------- 本日の出勤(本家 upsertTodaySchedule) ----------
export async function upsertTodaySchedule(
  shopId: string,
  castId: string,
  scheduleId: string | null,
  date: string,
  formData: FormData,
) {
  const supabase = await requireShopAccess(shopId);

  const isWorking = formData.get("is_working_today") === "on";
  const startTime = String(formData.get("start_time") ?? "").trim();
  const endTime = String(formData.get("end_time") ?? "").trim();

  const { data: cast } = await supabase
    .from("locapass_cast_members")
    .select("id")
    .eq("id", castId)
    .eq("shop_id", shopId)
    .maybeSingle();
  if (!cast) throw new Error("対象のキャストが見つかりません");

  const payload = {
    cast_id: castId,
    date,
    is_working_today: isWorking,
    start_time: startTime || null,
    end_time: endTime || null,
  };
  const { data, error } = scheduleId
    ? await supabase.from("locapass_schedules").update(payload).eq("id", scheduleId).eq("cast_id", castId).select("id")
    : await supabase.from("locapass_schedules").insert(payload).select("id");

  if (error) throw new Error(`出勤予定の更新に失敗しました: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error("出勤予定の更新に失敗しました(対象が見つからないか、権限がありません)");
  }
  revalidateShop(shopId);
}

// ---------- マップのカード動画(本家 setMapPreviewReel) ----------
/**
 * マップのカードで流す動画リールを選ぶ(nullで解除＝最新の動画リールに戻す)。
 * 実際に再生されるのは動画オプション契約店舗だけ。
 * 選べるのは自店舗の公開中の動画リールだけで、DBのトリガーでも同じ条件を強制している。
 */
export async function setMapPreviewReel(shopId: string, reelId: string | null) {
  const supabase = await requireShopAccess(shopId);
  const { data, error } = await supabase
    .from("locapass_shops")
    .update({ map_preview_reel_id: reelId })
    .eq("id", shopId)
    .select("id");

  if (error) {
    throw new Error(
      error.message.includes("map preview reel")
        ? "カード動画に使えるのは、この店舗の公開中の動画リールだけです"
        : `カード動画の設定に失敗しました: ${error.message}`,
    );
  }
  if (!data || data.length === 0) {
    throw new Error("カード動画の設定に失敗しました(対象の店舗が見つからないか、権限がありません)");
  }

  revalidatePath(`/dashboard/shop/${shopId}/reels`);
  revalidatePath("/map");
}
