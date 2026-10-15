"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getShopForManager } from "@/lib/locapass-dashboard/current-shop";
import { notifyBoostCreated } from "@/lib/boost/notify";

export type BoostActionResult = { ok: true } | { ok: false; error: string };

/** ⚡ブーストを発射する。掲載時間(60分)と同時掲載数の上限はDBトリガー側で強制する。 */
export async function launchBoost(shopId: string, input: {
  title: string;
  description: string;
  imageUrl: string | null;
  discountTag: string | null;
}): Promise<BoostActionResult> {
  const viewer = await getShopForManager(shopId);
  if (!viewer) return { ok: false, error: "権限がありません" };

  const title = input.title.trim();
  const description = input.description.trim();
  const discountTag = input.discountTag?.trim() || null;
  if (!title) return { ok: false, error: "タイトルを入力してください" };
  if (title.length > 80) return { ok: false, error: "タイトルは80文字以内にしてください" };
  if (!description) return { ok: false, error: "詳細メッセージを入力してください" };
  if (description.length > 600) return { ok: false, error: "詳細は600文字以内にしてください" };
  if (discountTag && discountTag.length > 20) return { ok: false, error: "特典タグは20文字以内にしてください" };

  const supabase = await createClient();
  const { data, error } = await (supabase as any)
    .from("locapass_boost_posts")
    .insert({ shop_id: shopId, title, description, image_url: input.imageUrl || null, discount_tag: discountTag })
    .select("id")
    .single();
  if (error || !data) {
    if (error?.message?.includes("boost_limit")) return { ok: false, error: "同時に掲載できるブーストは3件までです。終了してから発射してください" };
    return { ok: false, error: `発射に失敗しました: ${error?.message ?? "不明なエラー"}` };
  }

  // 将来のPush通知用フック。失敗しても投稿は成功扱い。
  await notifyBoostCreated({ id: data.id, title, shopId }).catch(() => {});

  revalidatePath("/boost");
  revalidatePath(`/dashboard/shop/${shopId}/boost`);
  return { ok: true };
}

/** 掲載中のブーストを早めに終了する(満席になった等)。 */
export async function endBoost(shopId: string, boostId: string): Promise<BoostActionResult> {
  const viewer = await getShopForManager(shopId);
  if (!viewer) return { ok: false, error: "権限がありません" };
  const supabase = await createClient();
  // RLSで0件更新でもエラーにならないため、.select()で実際に更新できたか確認する。
  const { data, error } = await (supabase as any)
    .from("locapass_boost_posts")
    .update({ status: "expired" })
    .eq("id", boostId)
    .eq("shop_id", shopId)
    .select("id");
  if (error || !data?.length) return { ok: false, error: "終了できませんでした" };
  revalidatePath("/boost");
  revalidatePath(`/dashboard/shop/${shopId}/boost`);
  return { ok: true };
}
