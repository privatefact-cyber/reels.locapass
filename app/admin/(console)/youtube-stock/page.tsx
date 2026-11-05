import { requireRootAdmin } from "@/lib/admin/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { addTikTokUrl, collectShibuyaShorts, createDraftShopFromIngestion, findOfficialSiteForIngestion, publishReviewedYoutubeIngestion, reviewYoutubeIngestion } from "../youtube-intake/actions";
import { YoutubeStockGrid } from "./YoutubeStockGrid";

type Row = {
  id: string; source_provider: "youtube" | "tiktok"; source_id: string | null; thumbnail_url: string | null; youtube_id: string | null; video_url: string; title: string; description: string | null; channel_title: string | null;
  candidate_name: string | null; candidate_address: string | null; official_url: string | null; official_url_verified: boolean;
  match_status: string; match_reason: string | null; matched_shop_id: string | null; reel_id: string | null;
};

export default async function YoutubeStockPage() {
  await requireRootAdmin();
  const admin = createAdminClient();
  const { data } = await (admin as any).from("locapass_youtube_ingestions").select("*").eq("portal_id", 407).order("created_at", { ascending: false }).limit(100);
  const rows = (data ?? []) as Row[];
  const shopIds = [...new Set(rows.map((row) => row.matched_shop_id).filter((id): id is string => Boolean(id)))];
  const { data: shops } = shopIds.length ? await admin.from("locapass_shops").select("id, name, address").in("id", shopIds) : { data: [] };
  const shopName = new Map((shops ?? []).map((shop) => [shop.id, `${shop.name}${shop.address ? ` (${shop.address})` : ""}`]));
  const counts = rows.reduce<Record<string, number>>((result, row) => ({ ...result, [row.match_status]: (result[row.match_status] ?? 0) + 1 }), {});
  const actions = Object.fromEntries(rows.map((row) => [row.id, {
    findOfficialSite: findOfficialSiteForIngestion.bind(null, row.id),
    review: reviewYoutubeIngestion.bind(null, row.id),
    createDraft: createDraftShopFromIngestion.bind(null, row.id),
    publish: publishReviewedYoutubeIngestion.bind(null, row.id),
  }]));

  return <div className="max-w-7xl space-y-8">
    <div><p className="text-sm font-semibold text-blue-700">動画ストック</p><h1 className="mt-1 text-3xl font-bold text-slate-900">YouTube Shorts 動画一覧</h1><p className="mt-2 text-sm text-slate-600">サムネイルをタップすると小さなプレビューで再生できます。店名・住所・公式HPを確認して、ステータスと店舗IDを手動で更新できます。</p></div>
    <div className="grid gap-4 md:grid-cols-2"><form action={collectShibuyaShorts} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-[1fr_110px_auto]"><label className="text-sm font-semibold text-slate-700">YouTube検索語<input name="query" defaultValue="渋谷 グルメ カフェ" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label><label className="text-sm font-semibold text-slate-700">上限<input name="limit" type="number" min="1" max="50" defaultValue="50" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label><button className="self-end rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">YouTube収集</button></form><form action={addTikTokUrl} className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-5"><label className="flex-1 text-sm font-semibold text-slate-700">TikTok URLを追加<input name="tiktok_url" type="url" required placeholder="https://www.tiktok.com/@.../video/..." className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label><button className="self-end rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white">TikTokを追加</button></form></div>
    <div className="flex flex-wrap gap-2 text-sm"><span className="rounded-full bg-slate-100 px-3 py-1">候補 {rows.length}</span><span className="rounded-full bg-amber-100 px-3 py-1 text-amber-900">保留 {counts.pending ?? 0}</span><span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-900">既存店 {counts.matched_existing ?? 0}</span><span className="rounded-full bg-blue-100 px-3 py-1 text-blue-900">新規準備 {counts.ready_to_create ?? 0}</span><span className="rounded-full bg-slate-200 px-3 py-1">除外 {counts.rejected ?? 0}</span></div>
    <YoutubeStockGrid rows={rows} shopName={Object.fromEntries(shopName)} actions={actions} />
    {rows.length === 0 && <p className="text-sm text-slate-500">まだ動画はありません。</p>}
  </div>;
}
