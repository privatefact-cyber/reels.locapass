import { requireRootAdmin } from "@/lib/admin/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { addTikTokUrl, addYoutubeUrl, autoProcessPendingYoutube, collectShibuyaShorts, createDraftShopFromIngestion, enrichIntakeShops, findOfficialSiteForIngestion, publishReviewedYoutubeIngestion, reviewYoutubeIngestion, setYoutubeStockThumbnail } from "../youtube-intake/actions";
import { YoutubeStockGrid } from "./YoutubeStockGrid";
import { getBlockedChannelTitles } from "@/lib/youtube/stockHygiene";

type Row = {
  id: string; portal_id: number; source_provider: "youtube" | "tiktok"; source_id: string | null; thumbnail_url: string | null; youtube_id: string | null; video_url: string; title: string; description: string | null; channel_title: string | null;
  candidate_name: string | null; candidate_address: string | null; official_url: string | null; official_url_verified: boolean;
  match_status: string; match_reason: string | null; error_message: string | null; matched_shop_id: string | null; reel_id: string | null;
};

// 「保留を自動処理」「不足項目を補完」は外部API(Gemini)を続けて呼ぶので長めにとる。
export const maxDuration = 300;

export default async function YoutubeStockPage({ searchParams }: { searchParams: Promise<{ collection?: string; label?: string; query?: string; fetched?: string; saved?: string; message?: string; total?: string; added?: string; exists?: string; failed?: string; fails?: string }> }) {
  await requireRootAdmin();
  const collectionResult = await searchParams;
  const admin = createAdminClient();
  const [{ data }, { data: portals }] = await Promise.all([
    (admin as any).from("locapass_youtube_ingestions").select("*").order("created_at", { ascending: false }).limit(2000),
    admin.from("locapass_portals").select("id, slug, name, status").eq("status", "active").order("id"),
  ]);
  // 一覧が長いので、説明文は300文字までにして、画面に渡すデータを軽くする。
  const rows = ((data ?? []) as Row[]).map((row) => ({ ...row, description: row.description ? row.description.slice(0, 300) : row.description }));
  const shopIds = [...new Set(rows.map((row) => row.matched_shop_id).filter((id): id is string => Boolean(id)))];
  const { data: shops } = shopIds.length ? await admin.from("locapass_shops").select("id, name, address, status, cover_url, address_en").in("id", shopIds) : { data: [] };
  const activeShops = (shops ?? []).filter((shop) => shop.status === "active");
  const missingAddressEn = activeShops.filter((shop) => shop.address && !shop.address_en).length;
  const shopName = new Map((shops ?? []).map((shop) => [shop.id, `${shop.name}${shop.address ? ` (${shop.address})` : ""}`]));
  const portalOptions = (portals ?? []).map((portal) => ({ id: portal.id, label: `${portal.name} (${portal.slug})` }));
  const blockedChannels = await getBlockedChannelTitles();
  const actions = Object.fromEntries(rows.map((row) => [row.id, {
    findOfficialSite: findOfficialSiteForIngestion.bind(null, row.id),
    review: reviewYoutubeIngestion.bind(null, row.id),
    createDraft: createDraftShopFromIngestion.bind(null, row.id),
    publish: publishReviewedYoutubeIngestion.bind(null, row.id),
    setThumbnail: setYoutubeStockThumbnail.bind(null, row.id),
  }]));

  const fetchedCount = Math.max(0, Number(collectionResult.fetched) || 0);
  const savedCount = Math.max(0, Number(collectionResult.saved) || 0);
  const duplicateCount = Math.max(0, fetchedCount - savedCount);

  return <div className="max-w-7xl space-y-8">
    <div><p className="text-sm font-semibold text-blue-700">動画ストック</p><h1 className="mt-1 text-3xl font-bold text-slate-900">YouTube Shorts 動画一覧</h1><p className="mt-2 text-sm text-slate-600">サムネイルをタップすると小さなプレビューで再生できます。店名と住所が分かれば掲載できます(公式HPは任意)。ステータスと登録ポータルは手動でも更新できます。</p></div>
    {collectionResult.collection === "done" && <div className="rounded-2xl border border-emerald-300 bg-emerald-50 px-5 py-4 text-sm text-emerald-950"><p className="font-bold">「{collectionResult.query || "検索語"}」の収集が完了しました</p><p className="mt-1">YouTubeから {fetchedCount}件取得し、新規 {savedCount}件を追加しました。重複 {duplicateCount}件は追加していません。</p>{savedCount === 0 && <p className="mt-1 font-semibold">今回はすべて収集済みです。既存の動画は一覧に残っています。</p>}</div>}
    {collectionResult.collection === "added" && <div className="rounded-2xl border border-emerald-300 bg-emerald-50 px-5 py-4 text-sm font-semibold text-emerald-950">{collectionResult.message}</div>}
    {collectionResult.collection === "bulk" && (() => {
      const num = (value?: string) => Math.max(0, Number(value) || 0);
      const label = collectionResult.label === "YouTube" ? "YouTube" : "TikTok";
      const total = num(collectionResult.total), added = num(collectionResult.added), exists = num(collectionResult.exists), failed = num(collectionResult.failed);
      let fails: { u: string; r: string }[] = [];
      try { const parsed = JSON.parse(collectionResult.fails ?? "[]"); if (Array.isArray(parsed)) fails = parsed.filter((item) => item && typeof item.u === "string" && typeof item.r === "string").slice(0, 5); } catch { /* 表示しないだけ */ }
      const tone = failed === 0 ? "border-emerald-300 bg-emerald-50 text-emerald-950" : added > 0 ? "border-amber-300 bg-amber-50 text-amber-950" : exists > 0 ? "border-slate-300 bg-slate-50 text-slate-900" : "border-red-300 bg-red-50 text-red-900";
      const title = failed === 0 ? (added > 0 ? `${label} ${added}本をストックに追加しました` : "貼り付けた動画は、すべてストックに登録済みでした") : added > 0 ? `${label} ${added}本を追加しました(${failed}本は追加できませんでした)` : exists > 0 ? `新しく追加した動画はありません(登録済み ${exists}本・追加できなかった ${failed}本)` : `${label}の動画を追加できませんでした`;
      return <div className={`rounded-2xl border px-5 py-4 text-sm ${tone}`}>
        <p className="font-bold">{title}</p>
        <p className="mt-1 text-xs">貼り付けた {total}本のうち: 追加 {added}本 ／ すでに登録済み {exists}本 ／ 追加できなかった {failed}本</p>
        {fails.length > 0 && <ul className="mt-2 space-y-1 text-xs">{fails.map((item, index) => <li key={index} className="break-all"><span className="font-semibold">{item.u}</span><br />→ {item.r}</li>)}{failed > fails.length && <li>ほか {failed - fails.length}本</li>}</ul>}
      </div>;
    })()}
    {collectionResult.collection === "error" && <div className="rounded-2xl border border-red-300 bg-red-50 px-5 py-4 text-sm text-red-900"><p className="font-bold">動画の追加・収集に失敗しました</p><p className="mt-1">{collectionResult.message || "時間をおいて再度お試しください。"}</p></div>}
    <div className="grid gap-4 md:grid-cols-2"><form action={collectShibuyaShorts} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-[1fr_110px_1fr_auto]"><label className="text-sm font-semibold text-slate-700">YouTube検索語<input name="query" defaultValue={collectionResult.query || "東京 グルメ カフェ"} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label><label className="text-sm font-semibold text-slate-700">上限<input name="limit" type="number" min="1" max="50" defaultValue="50" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label><label className="text-sm font-semibold text-slate-700">登録ポータル<select name="portal_id" defaultValue="55" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">{portalOptions.map((portal) => <option key={portal.id} value={portal.id}>{portal.label}</option>)}</select></label><button className="self-end rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">YouTube収集</button></form><form action={autoProcessPendingYoutube} className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5"><label className="flex-1 text-sm font-semibold text-amber-900">保留候補の自動処理<select name="portal_id" defaultValue="" className="mt-1 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm"><option value="">全ポータル</option>{portalOptions.map((portal) => <option key={portal.id} value={portal.id}>{portal.label}</option>)}</select><span className="mt-1 block text-xs font-normal text-amber-800">新しく収集した未判定の保留を最大5件AIで判定し、店名と住所が分かれば店舗登録(公開)・座標登録・リール投稿まで行います。失敗理由は動画カードに表示します。</span></label><button className="self-end rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white">新しい保留を5件処理</button></form><form action={addYoutubeUrl} className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-5"><label className="flex-1 text-sm font-semibold text-slate-700">YouTube共有URLを追加(まとめて貼れます)<textarea name="youtube_url" required rows={4} placeholder={"1行に1本ずつ貼り付け(最大30本)\nhttps://youtu.be/...\nhttps://youtube.com/shorts/..."} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" /><select name="portal_id" defaultValue="55" className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">{portalOptions.map((portal) => <option key={portal.id} value={portal.id}>{portal.label}</option>)}</select></label><button className="self-end rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white">YouTubeを追加</button></form><form action={enrichIntakeShops} className="flex gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><div className="flex-1 text-sm font-semibold text-emerald-900">登録店舗の不足項目を補完<span className="mt-1 block text-xs font-normal text-emerald-800">公開中の取り込み店舗 {activeShops.length}件のうち、英語の住所なし {missingAddressEn}件。住所の英語表記と紹介文の翻訳を最大15店ずつ埋めます(写真は使いません。写真の無い店は最新リールの画像が出ます)。</span></div><button className="self-end rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">補完する</button></form><form action={addTikTokUrl} className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-5"><label className="flex-1 text-sm font-semibold text-slate-700">TikTok URLを追加(共有リンクも可・まとめて貼れます)<textarea name="tiktok_url" required rows={4} placeholder={"1行に1本ずつ貼り付け(最大30本)\nhttps://vt.tiktok.com/...\nhttps://www.tiktok.com/@.../video/..."} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" /><select name="portal_id" defaultValue="55" className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">{portalOptions.map((portal) => <option key={portal.id} value={portal.id}>{portal.label}</option>)}</select></label><button className="self-end rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white">TikTokを追加</button></form></div>
    <YoutubeStockGrid rows={rows} shopName={Object.fromEntries(shopName)} portalOptions={portalOptions} actions={actions} blockedChannels={blockedChannels} />
    {rows.length === 0 && <p className="text-sm text-slate-500">まだ動画はありません。</p>}
  </div>;
}
