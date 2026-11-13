import { requireRootAdmin } from "@/lib/admin/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { VIDEO_PROVIDER_LABEL, type VideoProvider } from "@/lib/video";
import { ShopCastPicker } from "@/components/admin/ShopCastPicker";
import { searchShopsForEmbed, listMembersForEmbed, createEmbedPost, deleteEmbedPost, updateEmbedThumb } from "./actions";

type Row = { id: string; shop_id: string | null; title?: string | null; caption?: string | null; embed_provider: string; embed_ref: string; poster_url?: string | null; image_url?: string | null; created_at?: string; published_at?: string | null };

const inputClass = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-500";

export default async function AdminEmbedsPage() {
  await requireRootAdmin();
  const admin = createAdminClient();

  const [{ data: shops }, { data: reels }, { data: events }] = await Promise.all([
    Promise.resolve({ data: null as { id: string; name: string }[] | null }),
    (admin as any).from("locapass_reels").select("id, shop_id, caption, embed_provider, embed_ref, poster_url, published_at").not("embed_provider", "is", null).order("published_at", { ascending: false }).limit(100),
    (admin as any).from("locapass_shop_events").select("id, shop_id, title, embed_provider, embed_ref, image_url, created_at").not("embed_provider", "is", null).order("created_at", { ascending: false }).limit(100),
  ]);
  const usedIds = [...new Set([...(reels ?? []), ...(events ?? [])].map((r: { shop_id: string | null }) => r.shop_id).filter((x): x is string => Boolean(x)))];
  const { data: usedShops } = usedIds.length ? await admin.from("locapass_shops").select("id, name").in("id", usedIds) : { data: [] };
  const shopName = new Map((usedShops ?? []).map((s) => [s.id, s.name]));

  const list = (kind: "reel" | "event", rows: Row[] | null) =>
    !rows || rows.length === 0 ? (
      <p className="text-sm text-slate-500">まだありません。</p>
    ) : (
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3">
            <div className="h-16 w-12 shrink-0 overflow-hidden rounded bg-slate-100">
              {(r.poster_url ?? r.image_url) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={(r.poster_url ?? r.image_url)!} alt="" className="h-full w-full object-cover" />
              )}
            </div>
            <div className="min-w-0 flex-1 text-xs text-slate-600">
              <p className="truncate text-sm font-semibold text-slate-900">{r.title ?? r.caption ?? "(文章なし)"}</p>
              <p>
                {shopName.get(r.shop_id ?? "") ?? "(店舗不明)"} ・ {VIDEO_PROVIDER_LABEL[r.embed_provider as VideoProvider] ?? r.embed_provider}
              </p>
            </div>
            <form action={updateEmbedThumb.bind(null, kind, r.id)} className="flex items-center gap-1">
              <input type="file" name="thumb" accept="image/*" required className="w-40 text-[11px]" />
              <button type="submit" className="whitespace-nowrap text-xs text-blue-600 hover:underline">
                サムネイル変更
              </button>
            </form>
            <form action={deleteEmbedPost.bind(null, kind, r.id)}>
              <button type="submit" className="text-xs text-red-600 hover:underline">
                削除する
              </button>
            </form>
          </li>
        ))}
      </ul>
    );

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">外部動画の追加</h1>
        <p className="mt-1 text-sm text-slate-600">
          YouTubeショート・TikTok・Instagramリールのリンクを、リールまたはイベントの1枚として並べます(運営者のみ・一時的な仕組み)。
          サムネイルをタップすると、サイトの中で再生されます(時間の制限なし)。投稿の元の持ち主の権利に配慮し、公開されている動画だけを使ってください。
        </p>
      </div>

      <form action={createEmbedPost} className="space-y-4 rounded-lg border border-slate-200 bg-white p-5">
        <div>
          <label className="block text-sm font-semibold text-slate-700">追加先</label>
          <select name="kind" className={inputClass} defaultValue="reel">
            <option value="reel">リール(フィードの1枚)</option>
            <option value="event">イベント(イベントページの1枚)</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-700">店舗(この店舗の投稿として表示されます)</label>
          <ShopCastPicker searchShops={searchShopsForEmbed} listCasts={listMembersForEmbed} />
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-700">動画のURL</label>
          <input type="text" name="video_url" required placeholder="YouTubeショート / TikTok / Instagramリールのリンク" className={inputClass} />
          <p className="mt-1 text-[11px] text-slate-500">スマホの「共有 → リンクをコピー」の短縮URLも使えます。Instagramの写真の投稿は不可(リールのみ)。</p>
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-700">イベントのタイトル(イベントのとき必須)</label>
          <input type="text" name="title" maxLength={100} className={inputClass} />
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-700">文章(リールの説明 / イベントの本文・任意)</label>
          <textarea name="text" rows={3} maxLength={500} className={inputClass} />
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-700">リンク先URL(リールのみ・任意)</label>
          <input type="url" name="link_url" placeholder="https://" className={inputClass} />
          <p className="mt-1 text-[11px] text-slate-500">「詳しく見る」ボタンの飛び先です。空なら、その店舗の詳細ページへ飛びます。</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-semibold text-slate-700">開始日(イベントのみ・任意)</label>
            <input type="date" name="start_date" className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700">終了日(イベントのみ・任意)</label>
            <input type="date" name="end_date" className={inputClass} />
          </div>
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-700">サムネイル画像(任意)</label>
          <input type="file" name="thumb" accept="image/*" className="mt-1 block text-sm" />
          <p className="mt-1 text-[11px] text-slate-500">YouTubeとTikTokは自動で取得します。Instagramなど自動で取れないときは、店舗の表紙画像を代わりに使います(あとから一覧で差し替えられます)。上限3MB。</p>
        </div>
        <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
          投稿する
        </button>
      </form>


      <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
        店舗ごとのオプション(外部動画の追加など)のオン/オフは、上のメニューの「<a href="/admin/options" className="font-semibold text-slate-900 underline">オプション管理</a>」でできます。
      </p>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">追加したリール</h2>
        {list("reel", reels as Row[] | null)}
      </section>
      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">追加したイベント</h2>
        {list("event", events as Row[] | null)}
      </section>
    </div>
  );
}
