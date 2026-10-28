import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getShopForManager } from "@/lib/locapass-dashboard/current-shop";
import { replyGoogleReview } from "./actions";

type Review = {
  review_id: string;
  reviewer_name: string | null;
  star_rating: number | null;
  comment: string | null;
  review_created_at: string | null;
  reply_comment: string | null;
};

function fmt(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" });
}

/** Googleマップの口コミ。新しい口コミが付くと通知が届き、ここから返信できる(返信するかどうか・文面は店舗が決める)。 */
export default async function LocapassShopGoogleReviewsPage({ params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  const viewer = await getShopForManager(shopId);
  if (!viewer) notFound();

  const supabase = (await createClient()) as any;
  const [{ data: link }, { data: rows }] = await Promise.all([
    supabase.from("locapass_gbp_links").select("enabled, sync_reviews").eq("shop_id", shopId).maybeSingle(),
    supabase
      .from("locapass_gbp_reviews")
      .select("review_id, reviewer_name, star_rating, comment, review_created_at, reply_comment")
      .eq("shop_id", shopId)
      .order("review_created_at", { ascending: false })
      .limit(100),
  ]);
  const reviews = (rows ?? []) as Review[];
  const connected = !!link?.enabled && !!link?.sync_reviews;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Googleの口コミ</h1>
        <p className="mt-1 text-sm text-slate-600">
          Googleマップに付いた口コミを確認して、返信できます。新しい口コミが付くと、通知でお知らせします。
          返信は、お店の名前でGoogleマップに公開されます。返信するかどうか、どんな文面にするかは、お店が決められます。
        </p>
      </div>

      {!connected && (
        <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          このお店は、まだGoogleマップと連携していません。連携をご希望の場合は、運営にご相談ください。
        </p>
      )}
      {connected && reviews.length === 0 && <p className="text-sm text-slate-500">取り込んだ口コミは、まだありません。</p>}
      {viewer.isOperator && reviews.length > 0 && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">運営として閲覧しているため、返信はできません(店舗の画面から返信します)。</p>
      )}

      <ul className="space-y-4">
        {reviews.map((r) => (
          <li key={r.review_id} className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <p className="font-semibold text-slate-900">
                {r.reviewer_name || "Googleのユーザー"}{" "}
                <span className="text-amber-500" aria-label={`星${r.star_rating ?? 0}`}>
                  {"★".repeat(r.star_rating ?? 0)}
                  <span className="text-slate-300">{"★".repeat(5 - (r.star_rating ?? 0))}</span>
                </span>
              </p>
              <span className="text-xs text-slate-500">{fmt(r.review_created_at)}</span>
            </div>
            {r.comment ? <p className="whitespace-pre-wrap text-sm text-slate-800">{r.comment}</p> : <p className="text-sm text-slate-400">(文章なし・星のみ)</p>}

            {r.reply_comment && (
              <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                <p className="mb-1 text-xs font-semibold text-slate-500">お店からの返信</p>
                <p className="whitespace-pre-wrap">{r.reply_comment}</p>
              </div>
            )}

            {!viewer.isOperator && (
              <form action={replyGoogleReview} className="space-y-2">
                <input type="hidden" name="shopId" value={shopId} />
                <input type="hidden" name="reviewId" value={r.review_id} />
                <textarea
                  name="comment"
                  required
                  rows={3}
                  maxLength={4000}
                  defaultValue={r.reply_comment ?? ""}
                  placeholder="返信の文章(Googleマップに公開されます)"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-500"
                />
                <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-700">
                  {r.reply_comment ? "返信を書き換える" : "返信する"}
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
