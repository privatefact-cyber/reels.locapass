"use client";

import { useState } from "react";

const input = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900";

type Row = {
  id: string;
  source_provider: "youtube" | "tiktok";
  source_id: string | null;
  thumbnail_url: string | null;
  youtube_id: string | null;
  video_url: string;
  title: string;
  description: string | null;
  channel_title: string | null;
  candidate_name: string | null;
  candidate_address: string | null;
  official_url: string | null;
  official_url_verified: boolean;
  match_status: string;
  match_reason: string | null;
  matched_shop_id: string | null;
  reel_id: string | null;
};

type Action = (formData: FormData) => void | Promise<void>;

const labels: Record<string, string> = {
  pending: "保留",
  matched_existing: "既存店へ紐づけ済み",
  ready_to_create: "新規店舗準備",
  rejected: "除外",
};

export function YoutubeStockCard({
  row,
  shopLabel,
  findOfficialSite,
  review,
  createDraft,
  publish,
}: {
  row: Row;
  shopLabel?: string;
  findOfficialSite: Action;
  review: Action;
  createDraft: Action;
  publish: Action;
}) {
  const [preview, setPreview] = useState(false);
  const status = labels[row.match_status] ?? row.match_status;
  const isTikTok = row.source_provider === "tiktok";
  const thumbnail = row.thumbnail_url ?? (row.youtube_id ? `https://i.ytimg.com/vi/${row.youtube_id}/hqdefault.jpg` : null);

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button type="button" onClick={() => setPreview((value) => !value)} className="group relative block aspect-video w-full bg-slate-900 text-left" aria-label={`${preview ? "サムネイルに戻す" : "プレビューを再生"}: ${row.title}`}>
        {preview ? (
          <iframe className="h-full w-full" src={isTikTok ? `https://www.tiktok.com/player/v1/${row.source_id}?music_info=1&description=1` : `https://www.youtube.com/embed/${row.youtube_id}?autoplay=1&mute=1&playsinline=1`} title={row.title} allow="autoplay; encrypted-media; picture-in-picture" />
        ) : (
          <>
            {thumbnail ? <img src={thumbnail} alt="" className="h-full w-full object-cover transition group-hover:scale-[1.02]" /> : <div className="flex h-full items-center justify-center text-sm text-white">サムネイル未取得</div>}
            <span className="absolute inset-0 flex items-center justify-center bg-black/20"><span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/95 text-xl text-slate-900 shadow">▶</span></span>
          </>
        )}
      </button>
      <div className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <a href={row.video_url} target="_blank" rel="noreferrer" className="line-clamp-2 font-semibold text-slate-900 hover:text-blue-700 hover:underline">{row.title}</a>
            <p className="mt-1 text-xs text-slate-500">{row.channel_title ?? "チャンネル不明"} ・ {row.source_id ?? row.youtube_id}</p>
          </div>
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700"><span className={isTikTok ? "rounded bg-black px-1.5 py-0.5 text-[10px] text-white" : "rounded bg-red-600 px-1.5 py-0.5 text-[10px] text-white"}>{isTikTok ? "TikTok" : "YouTube"}</span>{status}</span>
        </div>
        {row.description && <p className="line-clamp-4 text-sm leading-6 text-slate-600">{row.description}</p>}

        <form action={findOfficialSite}><button className="text-sm font-semibold text-blue-700 hover:underline">公式サイト候補を検索</button></form>
        <form action={review} className="grid gap-3 border-t border-slate-100 pt-4">
          <label className="text-xs font-semibold text-slate-600">紹介された店名<input name="candidate_name" defaultValue={row.candidate_name ?? ""} className={input} /></label>
          <label className="text-xs font-semibold text-slate-600">住所・支店<input name="candidate_address" defaultValue={row.candidate_address ?? ""} className={input} /></label>
          <label className="text-xs font-semibold text-slate-600">確認済みの公式サイト<input name="official_url" type="url" defaultValue={row.official_url ?? ""} placeholder="https://" className={input} /></label>
          <label className="text-xs font-semibold text-slate-600">既存店舗ID<input name="shop_id" defaultValue={row.matched_shop_id ?? ""} placeholder="手動で紐づける場合" className={input} /></label>
          <label className="text-xs font-semibold text-slate-600">ステータス<select name="decision" defaultValue={row.match_status} className={input}><option value="pending">保留</option><option value="matched_existing">既存店舗へ紐づけ</option><option value="ready_to_create">新規店舗を作成</option><option value="rejected">除外</option></select></label>
          <label className="text-xs font-semibold text-slate-600">メモ<textarea name="match_reason" defaultValue={row.match_reason ?? ""} rows={2} className={input} /></label>
          <button className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">ステータスを保存</button>
        </form>
        {shopLabel && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">対象店舗: {shopLabel}</p>}
        {row.match_status === "ready_to_create" && !row.matched_shop_id && <form action={createDraft} className="grid gap-3 rounded-lg bg-amber-50 p-4"><p className="text-sm font-semibold text-amber-900">公式HPと住所を確認済みなら下書き店舗を発行</p><input name="name" defaultValue={row.candidate_name ?? ""} placeholder="店名" required className={input}/><input name="address" defaultValue={row.candidate_address ?? ""} placeholder="住所" required className={input}/><input name="official_url" type="url" defaultValue={row.official_url ?? ""} placeholder="https:// 公式サイト" required className={input}/><select name="category" defaultValue="カフェ・スイーツ" className={input}><option>カフェ・スイーツ</option><option>レストラン・食事</option><option>居酒屋・バー</option></select><button className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white">下書き店舗を発行</button></form>}
        {row.matched_shop_id && row.official_url_verified && !row.reel_id && <form action={publish}><button className="w-full rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">この店舗IDでリールを投稿</button></form>}
        {row.reel_id && <p className="text-sm font-semibold text-emerald-700">リール投稿済み</p>}
      </div>
    </article>
  );
}
