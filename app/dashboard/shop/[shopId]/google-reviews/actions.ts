"use server";

import { revalidatePath } from "next/cache";
import { getShopForManager } from "@/lib/locapass-dashboard/current-shop";
import { replyToGbpReview } from "@/lib/gbp/reviews";

/** 口コミへの返信(お店の名前で、Googleマップに公開される)。返信するのは店舗本人だけで、運営の代理閲覧では送れない。 */
export async function replyGoogleReview(formData: FormData) {
  const shopId = String(formData.get("shopId") ?? "");
  const viewer = await getShopForManager(shopId);
  if (!viewer) throw new Error("この店舗を操作する権限がありません");
  if (viewer.isOperator) throw new Error("運営として閲覧しているため、返信は送れません(店舗の画面から返信してください)");
  await replyToGbpReview(shopId, String(formData.get("reviewId") ?? ""), String(formData.get("comment") ?? ""));
  revalidatePath(`/dashboard/shop/${shopId}/google-reviews`);
}
