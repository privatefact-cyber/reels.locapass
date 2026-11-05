"use client";

import { useState } from "react";

const input = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900";

type Row = {
  id: string;
  portal_id: number;
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
  portalOptions,
  findOfficialSite,
  review,
  createDraft,
  publish,
}: {
  row: Row;
  shopLabel?: string;
  portalOptions: { id: number; label: string }[];
  findOfficialSite: Action;
  review: Action;
  createDraft: Action;
  publish: Action;
}) {
  const [preview, setPreview] = useState(false);
  const status = labels[row.match_status] ?? row.match_status;
  const isTikTok = row.source_provider === "tiktok";
  const portalLabel = portalOptions.find((portal) => portal.id === row.portal_id)?.label ?? ("ポータルID " + row.portal_id);
  const thumbnail = row.thumbnail_url ?? (row.youtube_id ? `https://i.ytimg.com/vi/${row.youtube_id}/hqdefault.jpg` : null);

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button type="button" onClick={() => setPreview((value) => !value)} className="group relative block aspect-square w-full overflow-hidden bg-slate-900 text-left" aria-label={`${preview ? "サムネイルに戻す" : "プレビューを再生"}: ${row.title}`}>
        {preview ? (
          <iframe className="h-full w-full" src={isTikTok ? `https://www.tiktok.com/player/v1/${row.source_id}?music_info=1&description=1` : `https://www.youtube.com/embed/${row.youtube_id}?autoplay=1&mute=1&playsinline=1`} title={row.title} allow="autoplay; encrypted-media; picture-in-picture" />
        ) : (
          <>
            {thumbnail ? <img src={thumbnail} alt="" className="h-full w-full scale-[1.35] object-cover transition group-hover:scale-[1.42]" /> : <div className="flex h-full items-center justify-center text-sm text-white">サムネイル未取得</div>}
            <span className="absolute inset-0 flex items-center justify-center bg-black/20"><span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/95 text-xl text-slate-900 shadow">▶</span></span>
          </>
        )}
      </button>
      <div className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <a href={row.video_url} target="_blank" rel="noreferrer" className="line-clamp-2 font-semibold text-slate-900 hover:text-blue-700 hover:underline">{row.title}</a>
            <p className="mt-1 text-xs text-slate-500">{row.channel_title ?? "チャンネル不明"} ・ {row.source_id ?? row.youtube_id}</p>
            <p className="mt-1 text-[11px] font-semibold text-indigo-700">登録先: {portalLabel}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1"><span className="flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700"><span className={isTikTok ? "rounded bg-black px-1.5 py-0.5 text-[10px] text-white" : "rounded bg-red-600 px-1.5 py-0.5 text-[10px] text-white"}>{isTikTok ? "TikTok" : "YouTube"}</span>{status}</span>{row.matched_shop_id && row.match_status === "ready_to_create" && <span className="rounded-full bg-orange-100 px-2.5 py-1 text-[10px] font-semibold text-orange-800">自動仮登録・要手動確認</span>}</div>
        </div>
        {row.description && <p className="line-clamp-2 text-xs leading-5 text-slate-600">{row.description}</p>}
        <div className={`rounded-lg border px-3 py-2 text-xs ${row.match_reason ? "border-amber-200 bg-amber-50 text-amber-900" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
          <p className="font-semibold">判定理由</p>
          <p className="mt-1 line-clamp-2 whitespace-pre-wrap leading-5">{row.match_reason ?? "理由未記録。店名・住所・公式サイトを確認してください。"}</p>
        </div>

        <form action={findOfficialSite}><button className="text-sm font-semibold text-blue-700 hover:underline">AIで店名・住所を特定</button></form>
        <details className="rounded-lg border border-slate-200 bg-slate-50">
          <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-slate-700">判定を編集</summary>
        <form action={review} className="grid gap-3 border-t border-slate-200 px-3 pb-3 pt-3">
          <label className="text-xs font-semibold text-slate-600">紹介された店名<input name="candidate_name" defaultValue={row.candidate_name ?? ""} className={input} /></label>
          <label className="text-xs font-semibold text-slate-600">住所・支店<input name="candidate_address" defaultValue={row.candidate_address ?? ""} className={input} /></label>
          <label className="text-xs font-semibold text-slate-600">公式サイト(任意)<input name="official_url" type="url" defaultValue={row.official_url ?? ""} placeholder="https://" className={input} /></label>
          <label className="text-xs font-semibold text-slate-600">既存店舗ID<input name="shop_id" defaultValue={row.matched_shop_id ?? ""} placeholder="手動で紐づける場合" className={input} /></label>
          <label className="text-xs font-semibold text-slate-600">登録ポータル<select name="portal_id" defaultValue={row.portal_id} className={input}>{portalOptions.map((portal) => <option key={portal.id} value={portal.id}>{portal.label}</option>)}</select></label>
          <label className="text-xs font-semibold text-slate-600">ステータス<select name="decision" defaultValue={row.match_status} className={input}><option value="pending">保留</option><option value="matched_existing">既存店舗へ紐づけ</option><option value="ready_to_create">新規店舗を作成</option><option value="rejected">除外</option></select></label>
          <label className="text-xs font-semibold text-slate-600">不確定の理由・修正メモ<textarea name="match_reason" defaultValue={row.match_reason ?? ""} placeholder="例：店名は一致するが支店住所が不明。公式HPで確認が必要。" rows={3} className={input} /></label>
          <button className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">ステータスを保存</button>
        </form>
        </details>
        {shopLabel && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">対象店舗: {shopLabel}</p>}
        {row.match_status === "ready_to_create" && !row.matched_shop_id && <form action={createDraft} className="grid gap-3 rounded-lg bg-amber-50 p-4"><p className="text-sm font-semibold text-amber-900">店名と住所が分かれば店舗を登録(公式HPは任意)</p><input type="hidden" name="portal_id" value={row.portal_id} /><input name="name" defaultValue={row.candidate_name ?? ""} placeholder="店名" required className={input}/><input name="address" defaultValue={row.candidate_address ?? ""} placeholder="住所" required className={input}/><input name="official_url" type="url" defaultValue={row.official_url ?? ""} placeholder="https:// 公式サイト(任意)" className={input}/><select name="category" defaultValue="カフェ・スイーツ" className={input}><option>カフェ・スイーツ</option><option>レストラン・食事</option><option>居酒屋・バー</option><option>ショッピング</option><option>観光・体験</option><option>その他</option></select><label className="flex items-center gap-2 text-sm text-amber-900"><input type="checkbox" name="publish" value="1" defaultChecked />すぐ公開する(地図・リールに表示)</label><button className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white">店舗を登録</button></form>}
        {row.matched_shop_id && !row.reel_id && <form action={publish}><button className="w-full rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">この店舗IDでリールを投稿</button></form>}
        {row.reel_id && <p className="text-sm font-semibold text-emerald-700">リール投稿済み</p>}
      </div>
    </article>
  );
}
