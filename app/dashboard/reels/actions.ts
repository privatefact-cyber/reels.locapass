"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentShop } from "@/lib/dashboard/current-shop";

export async function deleteReel(reelId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("reels").delete().eq("id", reelId).select("id");

  if (error || !data || data.length === 0) {
    throw new Error(`削除に失敗しました: ${error?.message ?? "対象が見つかりません"}`);
  }

  revalidatePath("/dashboard/reels");
  revalidatePath("/");
}

/**
 * マップのカードで流す動画リールを選ぶ(nullで解除＝最新の動画リールに戻す)。
 * 実際に再生されるのは動画オプション契約店舗だけ。
 * 選べるのは自店舗の公開中の動画リールだけで、DBのトリガーでも同じ条件を強制している。
 */
export async function setMapPreviewReel(reelId: string | null) {
  const shop = await requireCurrentShop();
  if (!shop) throw new Error("所属店舗が見つかりません");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shops")
    .update({ map_preview_reel_id: reelId })
    .eq("id", shop.id)
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

  revalidatePath("/dashboard/reels");
}
