import { addShopEmbed } from "@/app/dashboard/shop/[shopId]/embeds/actions";

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 disabled:bg-slate-100 disabled:text-slate-400";

/**
 * 店舗オプション「外部動画の追加」。YouTubeショート / TikTok / Instagramリールのリンクを、リール・イベントの1枚として並べる。
 * 契約していない店舗(enabled=false)には、フォームを灰色にし、オプションのボタンも押せない状態で出す(準備中)。
 */
export function ShopEmbedSection({ shopId, enabled }: { shopId: string; enabled: boolean }) {
  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-slate-900">外部動画の追加(オプション)</h2>
        {!enabled && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">準備中</span>}
      </div>
      <p className="text-sm text-slate-600">
        YouTubeショート・TikTok・Instagramリールのリンクを貼ると、リールまたはイベントの1枚として表示されます。タップすると、サイトの中で再生されます。
        説明文は自動で翻訳されます(動画の中身は原語のままです)。自分のアカウントの動画、または権利のある動画だけを使ってください。
      </p>

      <form action={addShopEmbed.bind(null, shopId)}>
        <fieldset disabled={!enabled} className="space-y-3 disabled:opacity-70">
          <div>
            <label className="block text-xs font-semibold text-slate-500">追加先</label>
            <select name="kind" defaultValue="reel" className={inputClass}>
              <option value="reel">リール</option>
              <option value="event">イベント</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500">動画のURL</label>
            <input type="text" name="video_url" required placeholder="YouTubeショート / TikTok / Instagramリールのリンク" className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500">イベントのタイトル(イベントのとき必須)</label>
            <input type="text" name="title" maxLength={100} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500">説明文(任意)</label>
            <textarea name="text" rows={3} maxLength={500} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500">リンク先URL(リールのみ・任意)</label>
            <input type="url" name="link_url" placeholder="https://" className={inputClass} />
            <p className="mt-1 text-[11px] text-slate-500">「詳しく見る」ボタンの飛び先です。空なら、この店舗のページへ飛びます。</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500">開始日(イベントのみ)</label>
              <input type="date" name="start_date" className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500">終了日(イベントのみ)</label>
              <input type="date" name="end_date" className={inputClass} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500">サムネイル画像(任意)</label>
            <input type="file" name="thumb" accept="image/*" disabled={!enabled} className="mt-1 block text-sm" />
            <p className="mt-1 text-[11px] text-slate-500">YouTubeは自動で付きます。TikTok・Instagramなど自動で取れないときは、お店の表紙画像を使います(上限3MB)。</p>
          </div>
        </fieldset>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          {enabled ? (
            <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
              追加する
            </button>
          ) : (
            <>
              {/* オプションの申し込みは準備中。押せない(グレーアウト)状態で見せておく。 */}
              <button
                type="button"
                disabled
                aria-disabled="true"
                className="cursor-not-allowed rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-400"
              >
                オプションを追加
              </button>
              <span className="text-xs text-slate-500">このオプションは現在準備中です。</span>
            </>
          )}
        </div>
      </form>
    </section>
  );
}
