import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getShopForManager } from "@/lib/locapass-dashboard/current-shop";
import { ConfirmSubmitButton } from "@/components/reels/ConfirmSubmitButton";
import { deleteReel, showArchivedReel } from "../actions";

const REASON_LABEL: Record<string, string> = {
  cast_removed: "FACES削除で保管",
  manual: "非表示にして保管",
};

/**
 * 書庫: 非表示にして店に保管しているリールの一覧。
 * 退店したFACESのリールは、店が「書庫に残す」を選ぶとここに入る。リールの持ち主は店舗なので、
 * 再表示も削除も店が自由に決められる(プラットフォームは使う/使わないを判断しない)。
 */
export async function ArchiveTab({ shopId }: { shopId: string }) {
  const viewer = await getShopForManager(shopId);
  if (!viewer) notFound();
  const shop = viewer.shop;

  const supabase = await createClient();
  const { data: reels } = await supabase
    .from("locapass_reels")
    .select(
      "id, caption, video_url, images, poster_url, like_count, hidden_at, hidden_reason, author_name, locapass_cast_members ( name ), locapass_shop_staff_members ( name )",
    )
    .eq("shop_id", shop.id)
    .eq("status", "draft")
    .not("hidden_reason", "is", null)
    .order("hidden_at", { ascending: false });

  return (
    <div className="space-y-6">
      <section>
        <p className="text-xs text-slate-500">{shop.name}</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">書庫</h1>
        <p className="mt-1 text-sm text-slate-600">
          非表示にして保管しているリールです。店のものなので、再表示も削除も自由にできます。
          無料プランでは、最新の動画1本を除き、投稿から30日を過ぎた動画は(書庫にあるものも含め)自動で削除されます。必要な動画は、事前に保存してください(規約をご確認ください)。
        </p>
      </section>

      {reels && reels.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6">
          {reels.map((r) => {
            const cast = Array.isArray(r.locapass_cast_members) ? r.locapass_cast_members[0] : r.locapass_cast_members;
            const staff = Array.isArray(r.locapass_shop_staff_members) ? r.locapass_shop_staff_members[0] : r.locapass_shop_staff_members;
            const authorName = cast?.name ?? staff?.name ?? r.author_name ?? `${shop.name}(店舗)`;
            const images = (r.images as { url: string }[] | null) ?? [];
            const imageUrl = images[0]?.url ?? r.poster_url;
            return (
              <div key={r.id} className="space-y-2">
                <div className="relative aspect-[9/16] overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                  {r.video_url ? (
                    <video src={`${r.video_url}#t=0.001`} className="h-full w-full object-cover" muted playsInline preload="metadata" />
                  ) : imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : null}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                    <p className="text-[11px] font-semibold text-white">{authorName}</p>
                    <p className="text-[10px] text-white/70">♥ {r.like_count}</p>
                  </div>
                </div>
                <p className="text-[10px] text-slate-500">
                  {REASON_LABEL[r.hidden_reason ?? ""] ?? "保管中"}
                  {r.hidden_at ? `(${new Date(r.hidden_at).toLocaleDateString("ja-JP")})` : ""}
                </p>
                <div className="flex gap-1">
                  <form action={showArchivedReel.bind(null, shopId, r.id)} className="flex-1">
                    <button type="submit" className="w-full rounded bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white hover:bg-slate-700">
                      再表示
                    </button>
                  </form>
                  <form action={deleteReel.bind(null, shopId, r.id)}>
                    <ConfirmSubmitButton
                      message={"この動画を削除しますか?\n削除すると元に戻せません。"}
                      className="rounded border border-slate-300 px-2 py-1 text-[11px] text-slate-600 hover:border-red-600 hover:text-red-600"
                    >
                      削除
                    </ConfirmSubmitButton>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-slate-500">書庫に保管しているリールはありません。</p>
      )}
    </div>
  );
}
