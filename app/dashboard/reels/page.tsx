import { createClient } from "@/lib/supabase/server";
import { requireCurrentShop } from "@/lib/dashboard/current-shop";
import { ShopReelPostForm } from "@/components/dashboard/ShopReelPostForm";
import { deleteReel, setMapPreviewReel } from "./actions";

export default async function DashboardReelsPage() {
  const shop = await requireCurrentShop();
  if (!shop) {
    return (
      <p className="text-sm text-red-600">
        所属店舗が見つかりません。運営者にお問い合わせください。
      </p>
    );
  }

  const supabase = await createClient();
  const [{ data: reels }, { data: shopRow }] = await Promise.all([
    supabase
      .from("reels")
      .select(
        "id, caption, media, likes_count, created_at, status, post_type, cast_members ( name ), shop_staff_members ( name )",
      )
      .eq("shop_id", shop.id)
      .order("created_at", { ascending: false }),
    supabase.from("shops").select("map_video_enabled, map_preview_reel_id").eq("id", shop.id).maybeSingle(),
  ]);

  const mapVideoEnabled = shopRow?.map_video_enabled ?? false;
  const selectedReelId = shopRow?.map_preview_reel_id ?? null;

  return (
    <div className="space-y-6">
      <section>
        <p className="text-xs text-slate-500">{shop.name}</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">リール投稿</h1>
        <p className="mt-1 text-sm text-slate-600">
          自店舗のキャスト・スタッフ・店舗アカウントが投稿したリール(縦型動画/写真)の一覧です。不適切な投稿はここから削除できます。
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
          <form action={setMapPreviewReel.bind(null, null)} className="mt-2">
            <button type="submit" className="text-xs text-slate-500 underline hover:text-slate-900">
              選択を解除して最新の動画リールに戻す
            </button>
          </form>
        )}
      </section>

      <ShopReelPostForm shopId={shop.id} />

      {reels && reels.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6">
          {reels.map((r) => {
            const cast = Array.isArray(r.cast_members) ? r.cast_members[0] : r.cast_members;
            const staff = Array.isArray(r.shop_staff_members)
              ? r.shop_staff_members[0]
              : r.shop_staff_members;
            const authorName = cast?.name ?? staff?.name ?? `${shop.name}(店舗)`;
            const media = (r.media as { type: string; url: string }[])[0];
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
                  <video
                    src={`${media.url}#t=0.001`}
                    className="h-full w-full object-cover"
                    muted
                    playsInline
                    preload="metadata"
                  />
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
                      <form action={setMapPreviewReel.bind(null, r.id)}>
                        <button
                          type="submit"
                          className="w-full rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-slate-900 hover:bg-white"
                        >
                          カード動画にする
                        </button>
                      </form>
                    ))}
                </div>
                <form action={deleteReel.bind(null, r.id)} className="absolute right-1 top-1">
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
