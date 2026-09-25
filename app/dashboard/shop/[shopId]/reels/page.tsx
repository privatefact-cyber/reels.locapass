import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getShopForManager } from "@/lib/locapass-dashboard/current-shop";
import { ShopReelPostForm } from "@/components/locapass-dashboard/ShopReelPostForm";
import { deleteReel, setMapPreviewReel } from "../actions";
import { StreamThumb } from "@/components/video/StreamThumb";

/**
 * LUXELA本家のリール投稿画面(app/dashboard/reels/page.tsx)と同じ画面。一覧・投稿・削除は
 * locapass_reels、マップのカード動画は locapass_shops.map_video_enabled / map_preview_reel_id につないである。
 */
export default async function LocapassShopReelsPage({
  params,
}: {
  params: Promise<{ shopId: string }>;
}) {
  const { shopId } = await params;
  const viewer = await getShopForManager(shopId);
  if (!viewer) notFound();
  const shop = viewer.shop;

  const supabase = await createClient();
  const { data: shopRow } = await supabase
    .from("locapass_shops")
    .select("map_video_enabled, map_preview_reel_id")
    .eq("id", shop.id)
    .maybeSingle();
  const { data: reelRows } = await supabase
    .from("locapass_reels")
    .select(
      "id, caption, video_url, images, poster_url, like_count, published_at, updated_at, status, reel_type, author_name, locapass_cast_members ( name ), locapass_shop_staff_members ( name )",
    )
    .eq("shop_id", shop.id)
    .order("published_at", { ascending: false, nullsFirst: false });

  // 本家reelsの形(media配列・likes_count・status=published・post_type=reel)に揃える。
  const reels = (reelRows ?? []).map((r) => {
    const images = (r.images as { url: string }[] | null) ?? [];
    const media = r.video_url
      ? [{ type: "video", url: r.video_url }]
      : images.length > 0
        ? images.map((img) => ({ type: "image", url: img.url }))
        : r.poster_url
          ? [{ type: "image", url: r.poster_url }]
          : [];
    return {
      id: r.id,
      caption: r.caption,
      media,
      likes_count: r.like_count,
      status: r.status === "publish" ? "published" : r.status,
      post_type: r.reel_type === "story" ? "story" : "reel",
      author_name: r.author_name,
      cast_members: r.locapass_cast_members,
      shop_staff_members: r.locapass_shop_staff_members,
    };
  });

  const mapVideoEnabled = shopRow?.map_video_enabled ?? false;
  const selectedReelId = shopRow?.map_preview_reel_id ?? null;

  return (
    <div className="space-y-6">
      <section>
        <p className="text-xs text-slate-500">{shop.name}</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">リール投稿</h1>
        <p className="mt-1 text-sm text-slate-600">
          自店舗のパートナー・スタッフ・店舗アカウントが投稿したリール(縦型動画/写真)の一覧です。不適切な投稿はここから削除できます。
        </p>
      </section>

      {/* マップのカードに流す動画の選択。再生は動画オプション契約店舗だけ。 */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-bold text-slate-900">マップのカード動画</h2>
          <span
            className={
              mapVideoEnabled
                ? "rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700"
                : "rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500"
            }
          >
            動画オプション: {mapVideoEnabled ? "契約中" : "未契約"}
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {mapVideoEnabled
            ? "下の動画リールから「カード動画にする」を押すと、マップのカードでその動画が流れます。選ばない場合は最新の動画リールが流れます。"
            : "現在マップのカードには店舗のトップ画像が表示されます。動画を流すには動画オプションのご契約が必要です(運営者にお問い合わせください)。選んでおいた動画は契約後に反映されます。"}
        </p>
        {selectedReelId && (
          <form action={setMapPreviewReel.bind(null, shop.id, null)} className="mt-2">
            <button type="submit" className="text-xs text-slate-500 underline hover:text-slate-900">
              選択を解除して最新の動画リールに戻す
            </button>
          </form>
        )}
      </section>

      <ShopReelPostForm shopId={shop.id} portalId={shop.portal_id} />

      {reels && reels.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6">
          {reels.map((r) => {
            const cast = Array.isArray(r.cast_members) ? r.cast_members[0] : r.cast_members;
            const staff = Array.isArray(r.shop_staff_members) ? r.shop_staff_members[0] : r.shop_staff_members;
            const authorName = cast?.name ?? staff?.name ?? r.author_name ?? `${shop.name}(店舗)`;
            const media = r.media[0];
            const canBeCardVideo =
              media?.type === "video" && r.status === "published" && r.post_type === "reel";
            const isSelected = r.id === selectedReelId;
            return (
              <div
                key={r.id}
                className={`relative aspect-[9/16] overflow-hidden rounded-lg border bg-slate-50 ${
                  isSelected ? "border-indigo-500 ring-2 ring-indigo-500" : "border-slate-200"
                }`}
              >
                {media?.type === "video" ? (
                  <StreamThumb url={media.url} className="h-full w-full object-cover" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={media?.url} alt="" className="h-full w-full object-cover" />
                )}
                <div className="absolute inset-x-0 bottom-0 space-y-1 bg-gradient-to-t from-black/80 to-transparent p-2">
                  <p className="text-[11px] font-semibold text-white">{authorName}</p>
                  <p className="text-[10px] text-white/70">♥ {r.likes_count}</p>
                  {canBeCardVideo &&
                    (isSelected ? (
                      <span className="block rounded bg-indigo-600 px-1.5 py-0.5 text-center text-[10px] font-semibold text-white">
                        カード動画に設定中
                      </span>
                    ) : (
                      <form action={setMapPreviewReel.bind(null, shop.id, r.id)}>
                        <button
                          type="submit"
                          className="w-full rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-slate-900 hover:bg-white"
                        >
                          カード動画にする
                        </button>
                      </form>
                    ))}
                </div>
                <form action={deleteReel.bind(null, shop.id, r.id)} className="absolute right-1 top-1">
                  <button
                    type="submit"
                    className="rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white hover:bg-red-600"
                  >
                    削除
                  </button>
                </form>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-slate-500">まだリール投稿はありません。</p>
      )}
    </div>
  );
}
