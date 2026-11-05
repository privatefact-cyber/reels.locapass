import { requireRootAdmin } from "@/lib/admin/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { collectShibuyaShorts, createDraftShopFromIngestion, findOfficialSiteForIngestion, publishReviewedYoutubeIngestion, reviewYoutubeIngestion } from "./actions";

const input = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900";

type Row = {
  id: string; youtube_id: string; video_url: string; title: string; description: string | null; channel_title: string | null;
  candidate_name: string | null; candidate_address: string | null; official_url: string | null; official_url_verified: boolean;
  match_status: string; match_reason: string | null; matched_shop_id: string | null; reel_id: string | null; created_at: string;
};

export default async function YoutubeIntakePage() {
  await requireRootAdmin();
  const admin = createAdminClient();
  const { data } = await (admin as any).from("locapass_youtube_ingestions").select("*").eq("portal_id", 407).order("created_at", { ascending: false }).limit(100);
  const rows = (data ?? []) as Row[];
  const shopIds = [...new Set(rows.map((r) => r.matched_shop_id).filter((id): id is string => Boolean(id)))];
  const { data: shops } = shopIds.length ? await admin.from("locapass_shops").select("id, name, address, status").in("id", shopIds) : { data: [] };
  const shopName = new Map((shops ?? []).map((shop) => [shop.id, `${shop.name} ${shop.address ? `(${shop.address})` : ""}`]));
  const counts = rows.reduce<Record<string, number>>((result, row) => ({ ...result, [row.match_status]: (result[row.match_status] ?? 0) + 1 }), {});

  return <div className="max-w-5xl space-y-8">
    <div>
      <h1 className="text-3xl font-bold text-slate-900">渋谷 YouTube Shorts 収集</h1>
      <p className="mt-1 text-sm text-slate-600">動画候補を集め、公式HPと支店を確認してから既存店舗へ紐づけるか下書き店舗を発行します。リール投稿は店舗IDと公式HPを確認済みの候補だけです。</p>
    </div>
    <form action={collectShibuyaShorts} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-5 sm:grid-cols-[1fr_110px_auto]">
      <label className="text-sm font-semibold text-slate-700">検索語<input name="query" defaultValue="渋谷 グルメ カフェ" className={input} /></label>
      <label className="text-sm font-semibold text-slate-700">上限<input name="limit" type="number" min="1" max="50" defaultValue="50" className={input} /></label>
      <button className="self-end rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">候補を収集</button>
    </form>
    <div className="flex flex-wrap gap-3 text-sm text-slate-600">
      <span>候補 {rows.length}</span><span>保留 {counts.pending ?? 0}</span><span>既存店 {counts.matched_existing ?? 0}</span><span>新規準備 {counts.ready_to_create ?? 0}</span><span>除外 {counts.rejected ?? 0}</span>
    </div>
    <div className="space-y-5">
      {rows.map((row) => <article key={row.id} className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><a href={row.video_url} target="_blank" rel="noreferrer" className="font-semibold text-blue-700 hover:underline">{row.title}</a><p className="mt-1 text-xs text-slate-500">{row.channel_title ?? "チャンネル不明"} ・ ID {row.youtube_id}</p></div><p className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">{row.match_status}</p></div>
        {row.description && <p className="mt-3 line-clamp-3 text-sm text-slate-600">{row.description}</p>}
        <form action={findOfficialSiteForIngestion.bind(null, row.id)} className="mt-3"><button className="text-sm font-semibold text-blue-700 hover:underline">公式サイト候補を検索</button></form>
        <form action={reviewYoutubeIngestion.bind(null, row.id)} className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="text-xs font-semibold text-slate-600">紹介された店名<input name="candidate_name" defaultValue={row.candidate_name ?? ""} className={input} /></label>
          <label className="text-xs font-semibold text-slate-600">住所・支店<input name="candidate_address" defaultValue={row.candidate_address ?? ""} className={input} /></label>
          <label className="text-xs font-semibold text-slate-600 md:col-span-2">確認済みの公式サイト<input name="official_url" type="url" defaultValue={row.official_url ?? ""} placeholder="https://" className={input} /></label>
          <label className="text-xs font-semibold text-slate-600">既存店舗ID<input name="shop_id" defaultValue={row.matched_shop_id ?? ""} placeholder="既存店舗に紐づけるときだけ" className={input} /></label>
          <label className="text-xs font-semibold text-slate-600">判定<select name="decision" defaultValue={row.match_status} className={input}><option value="pending">保留</option><option value="matched_existing">既存店舗へ紐づけ</option><option value="ready_to_create">新規店舗を作成</option><option value="rejected">除外</option></select></label>
          <label className="text-xs font-semibold text-slate-600 md:col-span-2">判定メモ<textarea name="match_reason" defaultValue={row.match_reason ?? ""} rows={2} className={input} /></label>
          <button className="w-fit rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">判定を保存</button>
        </form>
        {row.matched_shop_id && <p className="mt-3 text-sm text-emerald-700">対象店舗: {shopName.get(row.matched_shop_id) ?? row.matched_shop_id}</p>}
        {row.match_status === "ready_to_create" && !row.matched_shop_id && <form action={createDraftShopFromIngestion.bind(null, row.id)} className="mt-4 grid gap-3 rounded-lg bg-amber-50 p-4 md:grid-cols-2"><p className="text-sm font-semibold text-amber-900 md:col-span-2">公式HPと住所を確認済みなら、渋谷ポータルに下書き店舗を発行</p><input name="name" defaultValue={row.candidate_name ?? ""} placeholder="店名" required className={input}/><input name="address" defaultValue={row.candidate_address ?? ""} placeholder="住所" required className={input}/><input name="official_url" type="url" defaultValue={row.official_url ?? ""} placeholder="https:// 公式サイト" required className={input}/><select name="category" defaultValue="カフェ・スイーツ" className={input}><option>カフェ・スイーツ</option><option>レストラン・食事</option><option>居酒屋・バー</option></select><button className="w-fit rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white">下書き店舗を発行</button></form>}
        {row.matched_shop_id && !row.reel_id && <form action={publishReviewedYoutubeIngestion.bind(null, row.id)} className="mt-4"><button className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">この店舗IDでリールを投稿</button></form>}
        {row.reel_id && <p className="mt-4 text-sm font-semibold text-emerald-700">リール投稿済み</p>}
      </article>)}
      {rows.length === 0 && <p className="text-sm text-slate-500">まだ候補はありません。</p>}
    </div>
  </div>;
}

