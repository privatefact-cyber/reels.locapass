import { requireRootAdmin } from "@/lib/admin/require-admin";
import { listThreadsPosts, textModeFromEnv, type PostRow } from "@/lib/social/threadsPosts";
import { AUDIENCE_LABEL, LUXELA_TOPICS, THREADS_TOPICS } from "@/lib/social/threadsTopics";
import { getTokenStatuses } from "@/lib/social/tokens";
import { defaultStyleFor } from "@/lib/social/threadsWriter";
import { getSocialSettings, MAX_EXAMPLES, MAX_INSTRUCTIONS } from "@/lib/social/socialSettings";
import { getAutomationSettings } from "@/lib/social/socialAutomation";
import { listLatestInsights, type InsightRow } from "@/lib/social/socialInsights";
import { latestAuditRows } from "@/lib/social/apiAudit";
import { postToChecked, runApiAuditNow, attachDraftImage, composeDraftNow, generateFlyerBaseNow, prepareReelNow, saveReelDraftNow, discardDraft, editPostBody, publishDraft, removeDraftImage, checkTokensNow, refreshTokensNow, saveAiSettings, saveAutomation, schedulePost, unschedulePost } from "./actions";
import { PostComposer } from "./PostComposer";

// AIが文章を書くので、時間がかかる(最大3回まで書き直す)。
export const maxDuration = 120;

const MODE_LABEL = { off: "AIは何もしない", draft: "AIは下書きを作るだけ(確認してから予約・投稿)", auto: "AIが書いて、確認なしで自動投稿" } as const;
const STATUS_LABEL: Record<string, string> = { draft: "下書き", scheduled: "予約中", processing: "動画を処理中", posted: "投稿済み", failed: "失敗", discarded: "破棄" };
const input = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";
const btn = "rounded-lg px-4 py-2 text-sm font-semibold";

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }) : "");
/** datetime-local 用(日本時間)。 */
const jstInputValue = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + 9 * 3_600_000).toISOString().slice(0, 16) : "");
const DEST_LABEL = (p: PostRow) => `${p.platform === "instagram" ? "Instagram" : "Threads"} ${p.account === "luxela" ? "LUXELA" : "LOCAPASS"}`;
const label = (p: PostRow) => DEST_LABEL(p) + " ・ " + (p.source === "manual" ? (p.topic.startsWith("shop:") ? "店舗写真(定型文)" : "自分で書いた文章") : `AI・${AUDIENCE_LABEL[[...THREADS_TOPICS, ...LUXELA_TOPICS].find((t) => t.id === p.topic)?.audience ?? "shop"]}`);

const BRAND_LABEL = (p: PostRow) => (p.account === "luxela" ? "LUXELA" : "LOCAPASS");

function PostCard({ p }: { p: PostRow }) {
  const scheduled = p.status === "scheduled";
  const hasMedia = Boolean(p.image_url || p.video_url);
  return (
    <article className={`space-y-3 rounded-xl border p-4 ${scheduled ? "border-sky-300 bg-sky-50" : "border-amber-300 bg-amber-50"}`}>
      <p className="text-xs font-semibold text-slate-700">
        {scheduled ? `予約中 ・ ${fmt(p.scheduled_at)} に自動で投稿 ・ ${label(p)}` : `下書き ・ ${BRAND_LABEL(p)} ・ 投稿先は下のチェックで選びます`} ・ {p.body.length}文字
      </p>
      <form action={editPostBody.bind(null, p.id)} className="space-y-2">
        <textarea name="body" defaultValue={p.body} rows={Math.min(14, Math.max(5, Math.ceil(p.body.length / 28) + 2))} maxLength={2200} className={input} />
        <button className={`${btn} border border-slate-300 bg-white text-slate-700`}>文章を保存</button>
      </form>
      {p.video_url ? (
        <video src={p.video_url} controls preload="metadata" playsInline className="h-56 rounded-lg border border-slate-200 bg-black" />
      ) : p.image_url ? (
        <div className="flex items-end gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.image_url} alt="" className="h-28 w-28 rounded-lg border border-slate-200 object-cover" />
          <form action={removeDraftImage.bind(null, p.id)}><button className="text-xs font-semibold text-slate-600 underline">写真を外す</button></form>
        </div>
      ) : (
        <form action={attachDraftImage.bind(null, p.id)} className="flex flex-wrap items-center gap-2">
          <input type="file" name="image" accept="image/jpeg,image/png,image/webp" required className="text-xs text-slate-700" />
          <button className={`${btn} border border-slate-300 bg-white py-1.5 text-xs text-slate-700`}>写真を付ける</button>
          <span className="text-[11px] text-slate-500">付けると画像つきの投稿(3MBまで)</span>
        </form>
      )}
      {scheduled ? (
        <>
          <form action={schedulePost.bind(null, p.id)} className="flex flex-wrap items-center gap-2">
            <input type="datetime-local" name="scheduled_at" required defaultValue={jstInputValue(p.scheduled_at)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900" />
            <button className={`${btn} bg-sky-700 py-1.5 text-white`}>日時を変える</button>
            <span className="text-[11px] text-slate-500">日本時間。30分おきに確認して、時間になると自動で投稿します</span>
          </form>
          <div className="flex flex-wrap gap-2">
            <form action={publishDraft.bind(null, p.id)}><button className={`${btn} bg-emerald-700 text-white`}>今すぐ投稿(公開されます)</button></form>
            <form action={unschedulePost.bind(null, p.id)}><button className={`${btn} border border-slate-300 bg-white text-slate-700`}>予約を取り消す</button></form>
            <form action={discardDraft.bind(null, p.id)}><button className={`${btn} border border-slate-300 bg-white text-slate-700`}>破棄</button></form>
          </div>
        </>
      ) : (
        <>
          <form action={postToChecked.bind(null, p.id)} className="space-y-2 rounded-lg border border-slate-300 bg-white p-3">
            <p className="text-xs font-semibold text-slate-700">どこに投稿しますか(チェックした全部に、同じ内容が出ます)</p>
            <div className="flex flex-wrap gap-4 text-sm text-slate-800">
              <label className={`flex items-center gap-1 ${hasMedia ? "" : "text-slate-400"}`}>
                <input type="checkbox" name="to_instagram" defaultChecked={hasMedia} disabled={!hasMedia} />
                Instagram{p.video_url ? "(リール)" : p.image_url ? "(フィード)" : ""}{!hasMedia && <span className="text-[11px]">(写真か動画が必要です)</span>}
              </label>
              <label className="flex items-center gap-1"><input type="checkbox" name="to_threads" defaultChecked /> Threads</label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button name="intent" value="now" className={`${btn} bg-emerald-700 text-white`}>今すぐ投稿(公開されます)</button>
              <input type="datetime-local" name="scheduled_at" defaultValue={jstInputValue(p.scheduled_at)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900" />
              <button name="intent" value="schedule" className={`${btn} bg-sky-700 py-1.5 text-white`}>この日時に予約</button>
              <span className="text-[11px] text-slate-500">日本時間。予約は30分おきに確認して、時間になると自動で投稿します</span>
            </div>
          </form>
          <form action={discardDraft.bind(null, p.id)}><button className={`${btn} border border-slate-300 bg-white text-slate-700`}>破棄</button></form>
        </>
      )}
    </article>
  );
}

export default async function AdminThreadsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireRootAdmin();
  const sp = await searchParams;
  const mode = textModeFromEnv();
  const tokens = await getTokenStatuses();
  const [settingsLocapass, settingsLuxela, automation, insights] = await Promise.all([getSocialSettings("locapass"), getSocialSettings("luxela"), getAutomationSettings(), listLatestInsights().catch((): Record<string, InsightRow> => ({}))]);
  const hasGemini = Boolean(process.env.GEMINI_API_KEY);
  const audit = await latestAuditRows().catch(() => ({ at: null as string | null, rows: [] }));
  const posts = await listThreadsPosts().catch(() => []);
  const scheduled = posts.filter((p) => p.status === "scheduled").sort((a, b) => (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? ""));
  const drafts = posts.filter((p) => p.status === "draft");
  const processing = posts.filter((p) => p.status === "processing");
  const history = posts.filter((p) => p.status === "posted" || p.status === "failed");

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">SNS自動投稿(Instagram・Threads)</h1>
        <p className="mt-1 text-sm text-slate-600">
          ①どこに ②文章 ③画像・動画 を選んで下書きを作り、確認してから、投稿か日時の予約をします。予約した投稿は、時間になると自動で出ます(LOCAPASS・LUXELA、Instagram・Threads)。
        </p>
      </div>

      {sp.ok && <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">{sp.ok}</div>}
      {sp.error && <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900"><p className="font-bold">うまくいきませんでした</p><p className="mt-1">{sp.error}</p></div>}

      {tokens.some((t) => t.warn) && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          <p className="font-bold">⚠ SNSのトークンに注意が必要です(切れると投稿できなくなります)</p>
          <ul className="mt-1 list-disc pl-5">
            {tokens.filter((t) => t.warn).map((t) => <li key={t.label}>{t.label}: {t.warn}{t.lastError ? `(${t.lastError})` : ""}</li>)}
          </ul>
          <p className="mt-1 text-xs">下の「トークンを今すぐ延長」を試し、だめなら Meta のトークン生成ツールで作り直して Vercel の環境変数を入れ替えてください。</p>
        </div>
      )}

      <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-5 text-sm">
        <p><span className="font-semibold text-slate-700">予約投稿:</span> 動いています(30分おきに確認)</p>
        <p><span className="font-semibold text-slate-700">AIの動作:</span> {MODE_LABEL[mode]}<span className="ml-2 text-xs text-slate-500">(Vercelの環境変数 THREADS_TEXT_MODE: off / draft / auto)</span></p>
        <p><span className="font-semibold text-slate-700">投稿先のトークン:</span> {tokens.map((t) => <span key={t.label} className="mr-3 inline-block">{t.label} {!t.hasToken ? <span className="font-semibold text-red-700">未設定</span> : t.warn ? <span className="font-semibold text-red-700">⚠{t.warn}</span> : t.daysLeft !== null ? `✓(期限まで${t.daysLeft}日・自動で延長)` : "✓(自動延長の準備中)"}</span>)}</p>
        <p><span className="font-semibold text-slate-700">AI(Gemini)のキー:</span> {hasGemini ? "設定済み" : <span className="font-semibold text-red-700">未設定</span>}</p>
        <form action={checkTokensNow} className="mb-2"><button className={`${btn} border border-slate-300 bg-white py-1.5 text-xs text-slate-700`}>トークンが使えるか確認</button><span className="ml-2 text-[11px] text-slate-500">投稿はしません。持ち主の名前を問い合わせるだけです</span></form>
        <form action={refreshTokensNow}><button className={`${btn} border border-slate-300 bg-white py-1.5 text-xs text-slate-700`}>トークンを今すぐ延長</button><span className="ml-2 text-[11px] text-slate-500">自動では毎日1回、残り期限が少ないものを延長します。発行から24時間たっていないものは延長できません</span></form>
        <form action={runApiAuditNow}><button className={`${btn} border border-slate-300 bg-white py-1.5 text-xs text-slate-700`}>使える機能を調べる(API監査)</button><span className="ml-2 text-[11px] text-slate-500">読み取りだけ。投稿・返信・削除は一切しません。1分ほどかかります</span></form>
        {audit.rows.length > 0 && (
          <details className="rounded-lg border border-slate-200 p-3 text-xs">
            <summary className="cursor-pointer font-semibold text-slate-700">前回の監査結果({fmt(audit.at)})</summary>
            <table className="mt-2 w-full border-collapse text-left">
              <thead><tr className="text-slate-500"><th className="py-1 pr-2">投稿先</th><th className="pr-2">機能</th><th className="pr-2">結果</th><th>理由</th></tr></thead>
              <tbody>
                {audit.rows.map((r, i) => (
                  <tr key={i} className="border-t border-slate-100 align-top">
                    <td className="py-1 pr-2">{r.platform === "instagram" ? "IG" : "Threads"} {r.account === "luxela" ? "LUXELA" : "LOCAPASS"}</td>
                    <td className="pr-2">{r.label}</td>
                    <td className={`pr-2 font-semibold ${r.status === "ok" ? "text-emerald-700" : r.status === "error" ? "text-red-700" : "text-slate-500"}`}>{r.status === "ok" ? "使えた" : r.status === "error" ? "使えない" : "試せない"}</td>
                    <td className="text-slate-600">{r.status === "ok" ? (r.items !== null ? `${r.items}件` : "") : `${r.error_code ? `[${r.error_code}] ` : ""}${r.message ?? ""}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </section>

      <section className="space-y-3 rounded-xl border-2 border-slate-900 bg-white p-5">
        <h2 className="text-lg font-bold text-slate-900">投稿をつくる</h2>
        <p className="text-xs text-slate-500">①どこに ②文章 ③画像・動画 の順に選んで、下書きを作ります。公開はまだされません。</p>
        <PostComposer action={composeDraftNow} flyerAction={generateFlyerBaseNow} reelPrepare={prepareReelNow} reelSave={saveReelDraftNow} />
      </section>

      <section className="space-y-4 rounded-xl border-2 border-emerald-700 bg-emerald-50 p-5">
        <div>
          <h2 className="text-lg font-bold text-slate-900">自動運転</h2>
          <p className="mt-1 text-xs text-slate-600">投稿先ごとに毎日1回、店舗素材またはAI画像で投稿を作ります。最初は「下書きまで」で試してください。初期状態はすべて停止です。</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {automation.map((a) => {
            const name = `${a.platform === "instagram" ? "Instagram" : "Threads"} ${a.account === "luxela" ? "LUXELA" : "LOCAPASS"}`;
            return (
              <form key={`${a.platform}:${a.account}`} action={saveAutomation.bind(null, a.platform, a.account)} className="space-y-3 rounded-lg border border-emerald-200 bg-white p-4 text-sm">
                <p className="font-bold text-slate-900">{name}</p>
                <label className="flex items-center gap-2"><input type="checkbox" name="enabled" defaultChecked={a.enabled} />毎日動かす</label>
                <label className="block text-xs font-semibold text-slate-700">動き方
                  <select name="mode" defaultValue={a.mode} className={`${input} mt-1`}><option value="draft">下書きまで(確認してから公開)</option><option value="auto">確認なしで公開</option></select>
                </label>
                <label className="block text-xs font-semibold text-slate-700">素材
                  <select name="source" defaultValue={a.source} className={`${input} mt-1`}><option value="research">Webで話題を調べて作る</option><option value="shop">掲載店舗の素材</option><option value="ai">固定テーマから作る</option></select>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs font-semibold text-slate-700">時刻(日本時間)<input name="run_hour_jst" type="number" min="0" max="23" defaultValue={a.run_hour_jst} className={`${input} mt-1`} /></label>
                  <label className="text-xs font-semibold text-slate-700">1日の上限<input name="daily_max" type="number" min="1" max="3" defaultValue={a.daily_max} className={`${input} mt-1`} /></label>
                </div>
                <label className="flex items-center gap-2 font-semibold text-red-700"><input type="checkbox" name="emergency_stop" defaultChecked={a.emergency_stop} />緊急停止</label>
                {a.last_run_on && <p className="text-[11px] text-slate-500">最終実行: {a.last_run_on}</p>}
                {a.last_error && <p className="text-xs font-semibold text-red-700">前回の失敗: {a.last_error}</p>}
                <button className={`${btn} bg-emerald-700 text-white`}>この設定を保存</button>
              </form>
            );
          })}
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-bold text-slate-900">AIへの指示(文体・書き方)</h2>
        <p className="text-xs text-slate-500">ここに書いた指示を、AIが文章を書くたびに読みます。次に作る下書きから反映されます。「絶対に守ること」(数字・料金・比較・保証などの禁止)は、指示で外せません。お手本は、1本ずつ「---」だけの行で区切ってください(そのまま写した文章は自動で不採用になります)。</p>
        {([["locapass", "LOCAPASS", settingsLocapass], ["luxela", "LUXELA", settingsLuxela]] as const).map(([key, name, st]) => (
          <details key={key} className="rounded-lg border border-slate-200 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-slate-800">{name}{st.instructions || st.examples ? "(設定あり)" : "(未設定)"}</summary>
            <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
              <p className="font-semibold text-slate-700">いまの標準の書き方(指示欄が空のとき、AIはこれに従います)</p>
              {defaultStyleFor(key).map((d) => (
                <div key={d.label} className="mt-2">
                  <p className="font-semibold">{d.label}</p>
                  <p>読者: {d.reader}</p>
                  <p className="whitespace-pre-wrap">{d.style}</p>
                  <p>全体の長さ: {d.length}</p>
                </div>
              ))}
              <p className="mt-2">共通: 最後にサイトのURLを1つだけ / 数字・料金・最上級・他社比較は書かない(指示では外せません)</p>
            </div>
            <form action={saveAiSettings.bind(null, key)} className="mt-3 space-y-2">
              <label className="block text-xs font-semibold text-slate-700">指示(最大{MAX_INSTRUCTIONS}文字)</label>
              <textarea name="instructions" defaultValue={st.instructions} rows={6} maxLength={MAX_INSTRUCTIONS} placeholder="例: 親しい友達に話しかけるような口調で。1行目は必ず問いかけ。絵文字は1〜2個まで。専門用語は使わない。" className={input} />
              <label className="block text-xs font-semibold text-slate-700">お手本の文章(任意・最大{MAX_EXAMPLES}文字)</label>
              <textarea name="examples" defaultValue={st.examples} rows={6} maxLength={MAX_EXAMPLES} placeholder={"好みの投稿を貼る。複数なら、間に --- だけの行を入れる"} className={input} />
              <button className={`${btn} bg-slate-900 text-white`}>{name}の指示を保存</button>
            </form>
          </details>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-slate-900">予約中({scheduled.length})</h2>
        {scheduled.length === 0 && <p className="text-sm text-slate-500">予約している投稿はありません。</p>}
        {scheduled.map((p) => <PostCard key={p.id} p={p} />)}
      </section>

      {processing.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-slate-900">動画を処理中({processing.length})</h2>
          <p className="text-xs text-slate-500">InstagramやThreads側で動画を処理しています。終わると、自動で公開されます(30分おきに確認)。</p>
          {processing.map((p) => (
            <article key={p.id} className="space-y-1 rounded-xl border border-violet-300 bg-violet-50 p-4">
              <p className="text-xs font-semibold text-slate-700">{DEST_LABEL(p)} ・ 処理中</p>
              <p className="whitespace-pre-wrap text-sm leading-6 text-slate-800">{p.body}</p>
            </article>
          ))}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-slate-900">下書き({drafts.length})</h2>
        {drafts.length === 0 && <p className="text-sm text-slate-500">下書きはありません。</p>}
        {drafts.map((p) => <PostCard key={p.id} p={p} />)}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-slate-900">これまでの投稿</h2>
        {history.length === 0 && <p className="text-sm text-slate-500">まだありません。</p>}
        {history.map((p) => (
          <article key={p.id} className="space-y-1 rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">{STATUS_LABEL[p.status] ?? p.status} ・ {fmt(p.posted_at ?? p.created_at)} ・ {label(p)}</p>
            <p className="whitespace-pre-wrap text-sm leading-6 text-slate-800">{p.body}</p>
            {p.image_url && (/* eslint-disable-next-line @next/next/no-img-element */ <img src={p.image_url} alt="" className="h-20 w-20 rounded-lg border border-slate-200 object-cover" />)}
            {p.video_url && <p className="text-xs text-slate-500">🎬 動画つき</p>}
            {insights[p.id] && <p className="text-xs font-semibold text-emerald-800">成績({insights[p.id].collected_on}): 表示 {insights[p.id].views} / 届いた人数 {insights[p.id].reach} / 反応 {insights[p.id].likes + insights[p.id].comments + insights[p.id].replies + insights[p.id].reposts + insights[p.id].quotes + insights[p.id].shares + insights[p.id].saves}</p>}
            {p.error && <p className="text-xs font-semibold text-red-700">{p.error}</p>}
          </article>
        ))}
      </section>
    </div>
  );
}
