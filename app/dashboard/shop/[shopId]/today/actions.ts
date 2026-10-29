"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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
  const { error } = await supabase.from("locapass_shop_events").insert(rows);
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
