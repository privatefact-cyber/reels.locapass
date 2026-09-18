"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentShop } from "@/lib/dashboard/current-shop";
import { translateAddressToEnglish } from "@/lib/map/translateAddress";
import {
  refreshShopTranslations,
  translateEventText,
  translatePriceItemNames,
} from "@/lib/shop/shopTranslations";

export async function updateShopProfile(formData: FormData) {
  const shop = await requireCurrentShop();
  if (!shop) throw new Error("所属店舗が見つかりません");

  const name = String(formData.get("name") ?? "").trim();
  const area = String(formData.get("area") ?? "").trim();
  const genre = String(formData.get("genre") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const businessHours = String(formData.get("business_hours") ?? "").trim();
  const priceInfo = String(formData.get("price_info") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const coverImageUrl = String(formData.get("cover_image_url") ?? "").trim();
  const heroMediaUrl = String(formData.get("hero_media_url") ?? "").trim();
  const heroMediaTypeRaw = String(formData.get("hero_media_url_type") ?? "").trim();
  const heroMediaType = heroMediaTypeRaw === "video" ? "video" : "image";
  const websiteUrl = String(formData.get("website_url") ?? "").trim();
  const usageNotes = String(formData.get("usage_notes") ?? "").trim();
  const snsX = String(formData.get("sns_x") ?? "").trim();
  const snsInstagram = String(formData.get("sns_instagram") ?? "").trim();
  const snsLine = String(formData.get("sns_line") ?? "").trim();
  const lineUrl = String(formData.get("line_url") ?? "").trim();
  const lineQrImageUrl = String(formData.get("line_qr_image_url") ?? "").trim();

  if (!name) throw new Error("店舗名は必須です");

  const supabase = await createClient();

  // 住所が変わったら英語表記を裏で作り直す。店長には日本語住所だけを入力してもらい、
  // address_en は自動生成する(マップ検索がローマ字入力を拾うのに使う)。
  // 翻訳が落ちても店舗情報の保存自体は通す。
  const { data: currentShop } = await supabase
    .from("shops")
    .select("address, address_en")
    .eq("id", shop.id)
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

  const { data, error } = await supabase
    .from("shops")
    .update({
      name,
      area: area || null,
      genre: genre || null,
      address: address || null,
      ...addressEnPatch,
      phone: phone || null,
      business_hours: businessHours || null,
      price_info: priceInfo || null,
      description: description || null,
      cover_image_url: coverImageUrl || null,
      hero_media_url: heroMediaUrl || null,
      ...(heroMediaUrl ? { hero_media_type: heroMediaType } : {}),
      website_url: websiteUrl || null,
      usage_notes: usageNotes || null,
      line_url: lineUrl || null,
      line_qr_image_url: lineQrImageUrl || null,
      sns_links: {
        ...(snsX ? { x: snsX } : {}),
        ...(snsInstagram ? { instagram: snsInstagram } : {}),
        ...(snsLine ? { line: snsLine } : {}),
      },
    })
    .eq("id", shop.id)
    .select("id");

  if (error) throw new Error(`店舗情報の更新に失敗しました: ${error.message}`);
  // RLSにより対象行が0件のまま「成功扱い」で返ってくるケースを検知する
  // (updateはエラーを返さず単に0行更新で終わることがあるため)。
  if (!data || data.length === 0) {
    throw new Error("店舗情報の更新に失敗しました(対象の店舗が見つからないか、権限がありません)");
  }

  // 紹介文・営業時間などが変わっていたら、英語・中国語の翻訳を作り直す(変わっていなければ何もしない)。
  // 翻訳に失敗しても保存自体は成功扱い(表側は日本語のまま表示される)。
  await refreshShopTranslations(supabase, shop.id);

  revalidatePath("/dashboard/shop");
  revalidatePath(`/shops/${shop.id}`);
  revalidatePath("/");
}

export async function addPriceItem(formData: FormData) {
  const shop = await requireCurrentShop();
  if (!shop) throw new Error("所属店舗が見つかりません");

  const name = String(formData.get("name") ?? "").trim();
  const durationRaw = String(formData.get("duration_minutes") ?? "").trim();
  const priceRaw = String(formData.get("price") ?? "").trim();

  if (!name || !priceRaw) throw new Error("コース名と料金は必須です");

  const supabase = await createClient();
  const [nameTranslations] = await translatePriceItemNames([name]);
  const { error } = await supabase.from("shop_price_items").insert({
    shop_id: shop.id,
    name,
    duration_minutes: durationRaw ? Number(durationRaw) : null,
    price: Number(priceRaw),
    name_translations: nameTranslations ?? {},
  });

  if (error) throw new Error(`料金項目の登録に失敗しました: ${error.message}`);
  revalidatePath("/dashboard/shop");
  revalidatePath(`/shops/${shop.id}`);
}

export async function deletePriceItem(itemId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("shop_price_items").delete().eq("id", itemId);
  if (error) throw new Error(`料金項目の削除に失敗しました: ${error.message}`);
  revalidatePath("/dashboard/shop");
}

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

export async function addEvent(formData: FormData) {
  const shop = await requireCurrentShop();
  if (!shop) throw new Error("所属店舗が見つかりません");

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

  const supabase = await createClient();
  const translations = await translateEventText(title, body || null);
  const { error } = await supabase.from("shop_events").insert({
    shop_id: shop.id,
    title,
    body: body || null,
    starts_at: startsAt,
    ends_at: endsAt,
    image_url: imageUrl,
    gallery_image_urls: galleryImageUrls,
    translations,
  });

  if (error) throw new Error(`イベントの登録に失敗しました: ${error.message}`);
  revalidatePath("/dashboard/shop");
  revalidatePath(`/shops/${shop.id}`);
  revalidatePath("/events");
}

export async function deleteEvent(eventId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("shop_events").delete().eq("id", eventId);
  if (error) throw new Error(`イベントの削除に失敗しました: ${error.message}`);
  revalidatePath("/dashboard/shop");
}

/** 本日出勤ボードから、あるキャストの「今日」の出勤予定を登録/更新する(既存行があれば更新、無ければ新規作成)。 */
export async function upsertTodaySchedule(
  castId: string,
  scheduleId: string | null,
  date: string,
  formData: FormData,
) {
  const shop = await requireCurrentShop();
  if (!shop) throw new Error("所属店舗が見つかりません");

  const isWorking = formData.get("is_working_today") === "on";
  const startTime = String(formData.get("start_time") ?? "").trim();
  const endTime = String(formData.get("end_time") ?? "").trim();

  const supabase = await createClient();

  const { data: cast } = await supabase
    .from("cast_members")
    .select("id")
    .eq("id", castId)
    .eq("shop_id", shop.id)
    .single();
  if (!cast) throw new Error("対象のキャストが見つかりません");

  const payload = {
    cast_id: castId,
    date,
    is_working_today: isWorking,
    start_time: startTime || null,
    end_time: endTime || null,
  };

  const { data, error } = scheduleId
    ? await supabase.from("schedules").update(payload).eq("id", scheduleId).select("id")
    : await supabase.from("schedules").insert(payload).select("id");

  if (error) throw new Error(`出勤予定の更新に失敗しました: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error("出勤予定の更新に失敗しました(対象が見つからないか、権限がありません)");
  }

  revalidatePath("/dashboard/shop");
  revalidatePath(`/shops/${shop.id}`);
}

/**
 * マップのピン位置を保存する。
 * 人が意図して置いた座標なので geocode_source='manual' にして、
 * 住所からの一括ジオコーディング(scripts/geocode-shops.ts)で上書きされないようにする。
 */
export async function updateShopPin(shopId: string, lat: number, lng: number) {
  const shop = await requireCurrentShop();
  if (!shop) return { ok: false as const, error: "所属店舗が見つかりません" };
  // 自店舗以外を書き換えられないようにする(RLSに加えてここでも弾く)。
  if (shop.id !== shopId) return { ok: false as const, error: "この店舗を編集する権限がありません" };
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { ok: false as const, error: "座標が不正です" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shops")
    .update({ lat, lng, geocode_source: "manual", geocoded_at: new Date().toISOString() })
    .eq("id", shop.id)
    .select("id");

  if (error) return { ok: false as const, error: error.message };
  if (!data?.length) return { ok: false as const, error: "更新できませんでした(権限をご確認ください)" };

  revalidatePath("/dashboard/shop");
  revalidatePath("/map");
  return { ok: true as const };
}
