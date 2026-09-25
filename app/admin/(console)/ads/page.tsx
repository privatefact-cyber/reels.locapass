import { createClient } from "@/lib/supabase/server";
import { requireRootAdmin } from "@/lib/admin/require-admin";
import { createAd, deleteAd, setAdActive, updateAdFrequency } from "./actions";
import { StreamThumb } from "@/components/video/StreamThumb";

export default async function AdminAdsPage() {
  await requireRootAdmin();

  const supabase = await createClient();
  const { data: ads } = await supabase
    .from("locapass_ads")
    .select("id, title, media_type, media_url, poster_url, link_url, frequency, is_active, created_at")
    .order("created_at", { ascending: false });

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">広告(PR)投稿</h1>
        <p className="mt-1 text-sm text-slate-600">
          サイト管理者のみが投稿できるPRカードです。店舗・パートナーのリールと同じフィードに、
          指定した頻度で紛れ込ませて表示します。マネタイズ方法は未定のため、現状は表示のON/OFFと
          頻度の調整のみ行えます。
        </p>
      </div>

      <form
        action={createAd}
        className="space-y-4 rounded-lg border border-slate-200 bg-white p-5"
      >
        <div>
          <label className="block text-sm font-semibold text-slate-700">タイトル(社内管理用)</label>
          <input
            type="text"
            name="title"
            required
            maxLength={100}
            placeholder="〇〇社 秋のキャンペーン"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block cursor-pointer rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center transition hover:border-slate-400">
            <input type="file" name="file" accept="image/*,video/*" required className="hidden" />
            <span className="text-sm font-medium text-slate-600">写真・動画を選択(上限20MB)</span>
          </label>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700">リンク先URL</label>
          <input
            type="url"
            name="linkUrl"
            required
            placeholder="https://example.com/campaign"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <p className="mt-1 text-[11px] text-slate-500">
            タップ・クリックで飛ばす先を自由に設定できます(外部サイトでも可)。
          </p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700">表示頻度</label>
          <div className="mt-1 flex items-center gap-2 text-sm text-slate-700">
            <span>リールを</span>
            <input
              type="number"
              name="frequency"
              defaultValue={10}
              min={2}
              required
              className="w-20 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <span>件表示するごとに1回、フィードに挟みます</span>
          </div>
        </div>

        <button
          type="submit"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          投稿する
        </button>
      </form>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">投稿済みの広告</h2>
        {!ads || ads.length === 0 ? (
          <p className="text-sm text-slate-500">まだ投稿がありません。</p>
        ) : (
          <ul className="space-y-3">
            {ads.map((ad) => (
              <li
                key={ad.id}
                className="flex items-start gap-4 rounded-lg border border-slate-200 bg-white p-4"
              >
                <div className="h-20 w-14 shrink-0 overflow-hidden rounded-md bg-slate-100">
                  {ad.media_type === "video" ? (
                    <StreamThumb url={ad.media_url} className="h-full w-full object-cover" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={ad.media_url} alt="" className="h-full w-full object-cover" />
                  )}
                </div>

                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-slate-900">{ad.title}</p>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        ad.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {ad.is_active ? "配信中" : "停止中"}
                    </span>
                  </div>
                  <p className="truncate text-xs text-slate-500">{ad.link_url}</p>

                  <form action={updateAdFrequency.bind(null, ad.id)} className="flex items-center gap-2 text-xs text-slate-600">
                    <span>表示頻度: リール</span>
                    <input
                      type="number"
                      name="frequency"
                      defaultValue={ad.frequency}
                      min={2}
                      className="w-16 rounded border border-slate-300 px-2 py-1 text-xs"
                    />
                    <span>件ごと</span>
                    <button type="submit" className="text-blue-600 hover:underline">
                      更新
                    </button>
                  </form>

                  <div className="flex items-center gap-3 text-xs">
                    <form action={setAdActive.bind(null, ad.id, !ad.is_active)}>
                      <button type="submit" className="text-blue-600 hover:underline">
                        {ad.is_active ? "配信を停止する" : "配信を再開する"}
                      </button>
                    </form>
                    <form action={deleteAd.bind(null, ad.id)}>
                      <button type="submit" className="text-red-600 hover:underline">
                        削除する
                      </button>
                    </form>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
