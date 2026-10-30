"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { translateFieldsBatch } from "@/lib/i18n/contentTranslation";
import type { Json } from "@/types/supabase";

/**
 * 移動販売の「今日の出店」。位置つきイベント(locapass_shop_events の lat/lng/address)を作る・終える・消す。
 * 開始〜終了の間だけ、その店のピンが地図に出る。UPDATE/DELETEは対象0件でもエラーにならないので .select() で確認する。
 */

async function requireShopAccess(shopId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("ログインが必要です");
  const { data: canManage } = await supabase.rpc("locapass_is_shop_admin", { p_shop_id: shopId });
  if (!canManage) throw new Error("この店舗を編集する権限がありません");
  return supabase as any;
}

export type SpotInput = {
  lat: number;
  lng: number;
  address: string;
  /** ISO文字列。「営業開始」のときは省略(いま)。 */
  startsAt?: string;
  endsAt: string;
  note?: string;
  /** true=いま営業を始める、false=前もっての予定 */
  openNow: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function validate(input: SpotInput) {
  if (!Number.isFinite(input.lat) || !Number.isFinite(input.lng) || Math.abs(input.lat) > 90 || Math.abs(input.lng) > 180) {
    throw new Error("場所が正しくありません。地図で場所を選んでください");
  }
  const now = Date.now();
  const starts = input.openNow ? now : Date.parse(input.startsAt ?? "");
  const ends = Date.parse(input.endsAt);
  if (!Number.isFinite(starts) || !Number.isFinite(ends)) throw new Error("日時が正しくありません");
  if (ends <= starts) throw new Error("終了は開始より後にしてください");
  if (ends <= now) throw new Error("終了がすでに過ぎています");
  if (ends - starts > DAY_MS) throw new Error("1回の出店は24時間以内にしてください");
  if (starts > now + 180 * DAY_MS) throw new Error("開始は180日以内にしてください");
  const address = input.address.trim().slice(0, 120);
  const note = (input.note ?? "").trim().slice(0, 300);
  return { starts: new Date(starts).toISOString(), ends: new Date(ends).toISOString(), address, note };
}

/** 複数日の予定をまとめて登録する(繰り返し)。1回でも不正なら、何も登録しない。 */
export async function createSpots(shopId: string, inputs: SpotInput[]) {
  if (inputs.length === 0) throw new Error("登録する予定がありません");
  if (inputs.length > 60) throw new Error("一度に登録できるのは60件までです");
  const supabase = await requireShopAccess(shopId);
  const rows = inputs.map((input) => {
    const { starts, ends, address, note } = validate(input);
    const place = address || "出店場所";
    return {
      shop_id: shopId,
      title: `${input.openNow ? "営業中" : "出店予定"}:${place}`.slice(0, 80),
      body: note || null,
      starts_at: starts,
      ends_at: ends,
      lat: input.lat,
      lng: input.lng,
      address: address || null,
    };
  });
  // 表示言語ごとの翻訳(タイトル・ひとこと・住所)。同じ内容の組は1回だけ訳す。失敗しても登録は続け、翻訳は夜間の拾い直しに任せる。
  const keyOf = (r: (typeof rows)[number]) => JSON.stringify([r.title, r.body, r.address]);
  const unique = [...new Map(rows.map((r) => [keyOf(r), r])).values()];
  const translated = new Map<string, Json>();
  try {
    const results = await translateFieldsBatch(unique.map((r) => ({ title: r.title, body: r.body, address: r.address })));
    unique.forEach((r, i) => translated.set(keyOf(r), (results[i] ?? {}) as unknown as Json));
  } catch (e) {
    console.error("出店予定の翻訳に失敗しました(夜間の拾い直しで再試行されます):", e);
  }
  const { error } = await supabase.from("locapass_shop_events").insert(rows.map((r) => ({ ...r, translations: translated.get(keyOf(r)) ?? {} })));
  if (error) throw new Error(`登録に失敗しました: ${error.message}`);
  revalidateAll(shopId);
}

export async function createSpot(shopId: string, input: SpotInput) {
  await createSpots(shopId, [input]);
}

/** いま営業中の出店を、いま終える。 */
export async function endSpotNow(shopId: string, eventId: string) {
  const supabase = await requireShopAccess(shopId);
  const { data, error } = await supabase
    .from("locapass_shop_events")
    .update({ ends_at: new Date().toISOString() })
    .eq("id", eventId)
    .eq("shop_id", shopId)
    .not("lat", "is", null)
    .select("id");
  if (error) throw new Error(`終了に失敗しました: ${error.message}`);
  if (!data?.length) throw new Error("終了に失敗しました(対象が見つからないか、権限がありません)");
  revalidateAll(shopId);
}

export async function deleteSpot(shopId: string, eventId: string) {
  const supabase = await requireShopAccess(shopId);
  const { data, error } = await supabase
    .from("locapass_shop_events")
    .delete()
    .eq("id", eventId)
    .eq("shop_id", shopId)
    .not("lat", "is", null)
    .select("id");
  if (error) throw new Error(`削除に失敗しました: ${error.message}`);
  if (!data?.length) throw new Error("削除に失敗しました(対象が見つからないか、権限がありません)");
  revalidateAll(shopId);
}

function revalidateAll(shopId: string) {
  revalidatePath(`/dashboard/shop/${shopId}/today`);
  revalidatePath("/map");
}

/**
 * 店舗オプション「開催場所のお知らせ」(譲渡会・イベントなど)のオン/オフ。オーナー・ポータル管理者・システム管理者が切り替えられる
 * (権限は requireShopAccess と同じ)。0件更新でもエラーにならないので、更新された行が返るかで成否を確かめる。
 */
export async function updateShopSpotNotice(shopId: string, enabled: boolean) {
  const supabase = await requireShopAccess(shopId);
  const { data, error } = await supabase.from("locapass_shops").update({ spot_notice_enabled: enabled }).eq("id", shopId).select("slug, locapass_portals(slug)");
  if (error) throw new Error("保存に失敗しました");
  if (!data || data.length === 0) throw new Error("この操作をする権限がありません");
  const shop = data[0];
  const portal = Array.isArray(shop.locapass_portals) ? shop.locapass_portals[0] : shop.locapass_portals;
  if (shop.slug && portal?.slug) revalidatePath(`/${portal.slug}/shops/${shop.slug}`);
  revalidatePath(`/dashboard/shop/${shopId}`);
}
