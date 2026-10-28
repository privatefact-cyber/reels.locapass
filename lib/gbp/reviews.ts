import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/push/send";
import { gbpConfigured, listReviews, replyToReview } from "@/lib/gbp/client";
import { ensureAccountName } from "@/lib/gbp/account";

// 口コミの取得・店舗への通知・返信。書き込みはすべてサーバー側(service role)で行う。
// AIによる自動返信は作らない(返信するかどうか・文面は、店舗が決める)。
const db = () => createAdminClient() as any;

export type FetchReviewsResult = { status: "ok" | "skipped" | "error"; message?: string; total?: number; notified?: number };

export function reviewsPath(shopId: string) {
  return `/dashboard/shop/${shopId}/google-reviews`;
}

async function notifyShopAdmins(shopId: string, r: { star: number | null; comment: string | null }) {
  const admin = db();
  const { data: admins } = await admin.from("locapass_shop_admins").select("user_id").eq("shop_id", shopId);
  const snippet = (r.comment ?? "").replace(/\s+/g, " ").slice(0, 60);
  const title = `Googleに新しい口コミがあります${r.star ? `(★${r.star})` : ""}`;
  for (const a of (admins ?? []) as { user_id: string }[]) {
    await admin.from("locapass_notifications").insert({
      user_id: a.user_id,
      type: "google_review",
      title,
      body: snippet || null,
      url: reviewsPath(shopId),
      shop_id: shopId,
      push_dispatched_at: new Date().toISOString(),
    });
    // VAPID鍵が無い環境では、一覧への通知だけ入る(他の通知と同じ扱い)
    if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
      await sendPushToUser(a.user_id, { title, body: snippet, url: reviewsPath(shopId) }).catch(() => undefined);
    }
  }
}

/** 1店舗ぶんの口コミを取り込み、新しい(または編集された)返信待ちの口コミがあれば店舗に通知する */
export async function fetchReviewsForShop(shopId: string): Promise<FetchReviewsResult> {
  const admin = db();
  const { data: link } = await admin.from("locapass_gbp_links").select("*").eq("shop_id", shopId).maybeSingle();
  if (!link || !link.enabled || !link.sync_reviews) return { status: "skipped", message: "口コミの取得がオフです" };
  if (!gbpConfigured()) return { status: "skipped", message: "Google未接続のため、口コミは取得していません" };

  try {
    const account = await ensureAccountName(link);
    const reviews = await listReviews(account, link.gbp_location_id);

    const { data: existing } = await admin.from("locapass_gbp_reviews").select("review_id, notified_for").eq("shop_id", shopId);
    const known = new Map<string, string | null>(((existing ?? []) as { review_id: string; notified_for: string | null }[]).map((e) => [e.review_id, e.notified_for]));
    // 初回の取り込みは、過去の口コミを一気に通知しないよう、通知済みとして記録だけする
    const firstRun = known.size === 0;

    let notified = 0;
    for (const r of reviews) {
      const prev = known.get(r.reviewId);
      const needsNotice = !r.replyComment && (prev === undefined || (r.updateTime && prev !== r.updateTime));
      const shouldNotify = !firstRun && needsNotice;
      if (shouldNotify) {
        await notifyShopAdmins(shopId, { star: r.starRating, comment: r.comment });
        notified++;
      }
      const { error } = await admin.from("locapass_gbp_reviews").upsert(
        {
          shop_id: shopId,
          review_id: r.reviewId,
          reviewer_name: r.reviewerName,
          star_rating: r.starRating,
          comment: r.comment,
          review_created_at: r.createTime,
          review_updated_at: r.updateTime,
          reply_comment: r.replyComment,
          reply_updated_at: r.replyUpdateTime,
          // 通知した・初回で記録だけした・返信済み、のどれでも「この更新まで処理した」印を付ける
          notified_for: r.updateTime,
          fetched_at: new Date().toISOString(),
        },
        { onConflict: "shop_id,review_id" },
      );
      if (error) throw new Error(`口コミの保存に失敗しました: ${error.message}`);
    }
    return { status: "ok", total: reviews.length, notified };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : String(e) };
  }
}

/** 口コミに返信する(公開される)。返信できる人かどうかは、呼び出し側で確認してから呼ぶこと */
export async function replyToGbpReview(shopId: string, reviewId: string, comment: string): Promise<void> {
  const text = comment.trim();
  if (!text) throw new Error("返信の文章を入力してください");
  if (text.length > 4000) throw new Error("返信は4000文字以内にしてください");
  if (!gbpConfigured()) throw new Error("Googleと未接続のため、いまは返信できません");

  const admin = db();
  const { data: link } = await admin.from("locapass_gbp_links").select("*").eq("shop_id", shopId).maybeSingle();
  if (!link || !link.enabled) throw new Error("この店舗はGoogleと連携していません");
  const account = await ensureAccountName(link);
  await replyToReview(account, link.gbp_location_id, reviewId, text);
  const { data, error } = await admin
    .from("locapass_gbp_reviews")
    .update({ reply_comment: text, reply_updated_at: new Date().toISOString() })
    .eq("shop_id", shopId)
    .eq("review_id", reviewId)
    .select("review_id");
  if (error || !data?.length) throw new Error("返信は送れましたが、画面の記録を更新できませんでした");
}
