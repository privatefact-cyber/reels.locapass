import { createAdminClient } from "@/lib/supabase/admin";
import { syncAllToGbp } from "@/lib/gbp/sync";
import { fetchReviewsForShop } from "@/lib/gbp/reviews";
import { sendShopPhotos } from "@/lib/gbp/photos";

/** 毎日の自動処理: 営業情報の送信 → 口コミの取り込みと通知 → 同意済み店舗の写真の送信 */
export async function runGbpDaily() {
  const admin = createAdminClient() as any;
  const hours = await syncAllToGbp(admin);
  const { data: links } = await admin.from("locapass_gbp_links").select("shop_id").eq("enabled", true);

  let reviewNotices = 0;
  let reviewErrors = 0;
  let photosSent = 0;
  for (const l of (links ?? []) as { shop_id: string }[]) {
    const r = await fetchReviewsForShop(l.shop_id);
    reviewNotices += r.notified ?? 0;
    if (r.status === "error") reviewErrors++;
    const p = await sendShopPhotos(l.shop_id);
    photosSent += p.sent.length;
    await new Promise((res) => setTimeout(res, 300));
  }
  return {
    hours: { total: hours.results.length, ok: hours.results.filter((x) => x.status === "ok").length, error: hours.results.filter((x) => x.status === "error").length },
    reviews: { notified: reviewNotices, errors: reviewErrors },
    photos: { sent: photosSent },
  };
}
