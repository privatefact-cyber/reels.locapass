"use client";

import { useEffect, useRef, useState } from "react";
import { AvatarCropModal } from "@/components/AvatarCropModal";

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
  error_message: string | null;
  matched_shop_id: string | null;
  reel_id: string | null;
  liveness_fail_count?: number | null;
  liveness_reason?: string | null;
  auto_hidden_at?: string | null;
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
  setThumbnail,
  onToggleReject,
}: {
  row: Row;
  shopLabel?: string;
  portalOptions: { id: number; label: string }[];
  findOfficialSite: Action;
  review: Action;
  createDraft: Action;
  publish: Action;
  setThumbnail: Action;
  /** 除外の切り替え(公開済みのときは渡されず、ボタンも出さない)。 */
  onToggleReject?: () => Promise<void>;
}) {
  const [preview, setPreview] = useState(false);
  const [rejectBusy, setRejectBusy] = useState(false);
  // サムネイルの設定: 画像を選ぶ → 正方形に切り取る → そのまま保存。
  const fileInput = useRef<HTMLInputElement>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [thumbBusy, setThumbBusy] = useState(false);
  const [thumbError, setThumbError] = useState<string | null>(null);
  // カードにマウスを乗せている間は、コピーした画像をそのまま貼り付け(Cmd/Ctrl+V)・ドロップでき、ページや画面を移動せずに切り取りへ進める。
  const [hovered, setHovered] = useState(false);
  const pickImage = (file: File | null | undefined) => {
    if (!file || !file.type.startsWith("image/")) return false;
    setThumbError(null);
    setCropFile(file);
    return true;
  };
  useEffect(() => {
    if (!hovered || cropFile) return;
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.kind === "file" && i.type.startsWith("image/"));
      if (pickImage(item?.getAsFile())) e.preventDefault();
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hovered, cropFile]);
  const saveThumbnail = async (blob: Blob) => {
    setCropFile(null);
    setThumbBusy(true);
    setThumbError(null);
    try {
      const formData = new FormData();
      formData.set("thumb", new File([blob], "thumbnail.jpg", { type: "image/jpeg" }));
      await setThumbnail(formData);
    } catch (e) {
      setThumbError(e instanceof Error ? e.message : "サムネイルの保存に失敗しました");
    } finally {
      setThumbBusy(false);
    }
  };
  // 公式サイトの読み取り・店舗登録は数十秒かかるので、保存中だと分かるようにする。
  const [saving, setSaving] = useState(false);
  const saveReview = async (formData: FormData) => {
    setSaving(true);
    try { await review(formData); } finally { setSaving(false); }
  };
  const status = labels[row.match_status] ?? row.match_status;
  const isTikTok = row.source_provider === "tiktok";
  const portalLabel = portalOptions.find((portal) => portal.id === row.portal_id)?.label ?? ("ポータルID " + row.portal_id);
  // 管理者が切り取って設定した正方形の画像は、そのまま(拡大せず)出す。YouTube公式の画像は、上下の黒帯を隠すために拡大する。
  const customThumb = Boolean(row.thumbnail_url?.includes("/embed-thumbs/")) || isTikTok;
  const thumbnail = row.thumbnail_url ?? (row.youtube_id ? `https://i.ytimg.com/vi/${row.youtube_id}/hqdefault.jpg` : null);

  return (
    <article onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) e.preventDefault(); }} onDrop={(e) => { if (pickImage(e.dataTransfer.files[0])) e.preventDefault(); }} className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${row.reel_id ? "border-emerald-400 ring-1 ring-emerald-200" : "border-slate-200"}`}>
      <button type="button" onClick={() => setPreview((value) => !value)} className="group relative block aspect-square w-full overflow-hidden bg-slate-900 text-left" aria-label={`${preview ? "サムネイルに戻す" : "プレビューを再生"}: ${row.title}`}>
        {preview ? (
          <iframe className="h-full w-full" src={isTikTok ? `https://www.tiktok.com/player/v1/${row.source_id}?music_info=1&description=1` : `https://www.youtube.com/embed/${row.youtube_id}?autoplay=1&mute=1&playsinline=1`} title={row.title} allow="autoplay; encrypted-media; picture-in-picture" />
        ) : (
          <>
            {thumbnail ? <img src={thumbnail} alt="" className={`h-full w-full object-cover transition ${customThumb ? "" : "scale-[1.35] group-hover:scale-[1.42]"}`} /> : <div className="flex h-full items-center justify-center text-sm text-white">サムネイル未取得</div>}
            <span className="absolute inset-0 flex items-center justify-center bg-black/20"><span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/95 text-xl text-slate-900 shadow">▶</span></span>
          </>
        )}
      </button>
      <div className="space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) { setThumbError(null); setCropFile(f); } }} />
          <button type="button" disabled={thumbBusy} onClick={() => fileInput.current?.click()} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60">{thumbBusy ? "サムネイルを保存中…" : thumbnail ? "サムネイルを差し替え(正方形に切り取り)" : "サムネイルを設定(正方形に切り取り)"}</button>
          <span className="text-[11px] text-slate-500">コピーした画像は、カードにマウスを乗せて貼り付け(Cmd/Ctrl+V)、またはドロップでも設定できます</span>
          {thumbError && <span className="text-xs font-semibold text-red-600">{thumbError}</span>}
        </div>
        {cropFile && <AvatarCropModal file={cropFile} plain shape="square" title="サムネイルを切り取り" outputSize={720} applyLabel="この範囲で保存" onCancel={() => setCropFile(null)} onCropped={saveThumbnail} />}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <a href={row.video_url} target="_blank" rel="noreferrer" className="line-clamp-2 font-semibold text-slate-900 hover:text-blue-700 hover:underline">{row.title}</a>
            <p className="mt-1 text-xs text-slate-500">{row.channel_title ?? "チャンネル不明"} ・ {row.source_id ?? row.youtube_id}</p>
            <p className="mt-1 text-[11px] font-semibold text-indigo-700">登録先: {portalLabel}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">{row.reel_id && (row.auto_hidden_at ? <span className="rounded-full bg-amber-600 px-2.5 py-1 text-xs font-bold text-white">自動で非表示中</span> : <span className="rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white">公開済み</span>)}<span className="flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700"><span className={isTikTok ? "rounded bg-black px-1.5 py-0.5 text-[10px] text-white" : "rounded bg-red-600 px-1.5 py-0.5 text-[10px] text-white"}>{isTikTok ? "TikTok" : "YouTube"}</span>{status}</span>{row.matched_shop_id && row.match_status === "ready_to_create" && <span className="rounded-full bg-orange-100 px-2.5 py-1 text-[10px] font-semibold text-orange-800">自動仮登録・要手動確認</span>}{onToggleReject && <button type="button" disabled={rejectBusy} onClick={async () => { setRejectBusy(true); try { await onToggleReject(); } finally { setRejectBusy(false); } }} className={`rounded-lg px-3 py-1.5 text-xs font-bold disabled:cursor-wait disabled:opacity-60 ${row.match_status === "rejected" ? "border border-slate-300 text-slate-700 hover:bg-slate-50" : "bg-red-50 text-red-700 hover:bg-red-100"}`}>{rejectBusy ? "処理中…" : row.match_status === "rejected" ? "除外を取り消す" : "除外"}</button>}</div>
        </div>
        {row.description && <p className="line-clamp-2 text-xs leading-5 text-slate-600">{row.description}</p>}
        <div className={`rounded-lg border px-3 py-2 text-xs ${row.match_reason ? "border-amber-200 bg-amber-50 text-amber-900" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
          <p className="font-semibold">判定理由</p>
          <p className="mt-1 line-clamp-2 whitespace-pre-wrap leading-5">{row.match_reason ?? "理由未記録。店名・住所・公式サイトを確認してください。"}</p>
        </div>
        {row.reel_id && (row.auto_hidden_at || (row.liveness_fail_count ?? 0) > 0) && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <p className="font-semibold">{row.auto_hidden_at ? "動画が見られないため自動で非表示にしました" : `動画の確認で問題あり(${row.liveness_fail_count}回連続)`}</p>
            <p className="mt-1 leading-5">{row.liveness_reason ?? "理由未記録"}{row.auto_hidden_at ? " ・ 動画が復活すると自動で公開に戻ります" : " ・ 3回連続で非表示にします"}</p>
          </div>
        )}
        {row.error_message && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"><p className="font-semibold">自動処理で確認が必要</p><p className="mt-1 whitespace-pre-wrap leading-5">{row.error_message}</p></div>}

        <form action={findOfficialSite}><button className="text-sm font-semibold text-blue-700 hover:underline">AIで店名・住所を特定</button></form>
        <details className="rounded-lg border border-slate-200 bg-slate-50">
          <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-slate-700">判定を編集</summary>
        <form action={saveReview} className="grid gap-3 border-t border-slate-200 px-3 pb-3 pt-3">
          <label className="text-xs font-semibold text-slate-600">紹介された店名<input name="candidate_name" defaultValue={row.candidate_name ?? ""} className={input} /></label>
          <label className="text-xs font-semibold text-slate-600">住所・支店<input name="candidate_address" defaultValue={row.candidate_address ?? ""} className={input} /></label>
          <label className="text-xs font-semibold text-slate-600">公式サイト(任意)<input name="official_url" type="url" defaultValue={row.official_url ?? ""} placeholder="https://" className={input} /><span className="mt-1 block text-[11px] font-normal leading-4 text-slate-500">公式サイトのURLを貼って保存すると、店名・住所・業種・営業時間・電話番号などを自動で取得し、そのまま店舗登録とリール公開まで進めます(手入力済みの項目は上書きしません)。</span></label>
          <label className="text-xs font-semibold text-slate-600">既存店舗ID<input name="shop_id" defaultValue={row.matched_shop_id ?? ""} placeholder="手動で紐づける場合" className={input} /></label>
          <label className="text-xs font-semibold text-slate-600">登録ポータル<select name="portal_id" defaultValue={row.portal_id} className={input}>{portalOptions.map((portal) => <option key={portal.id} value={portal.id}>{portal.label}</option>)}</select></label>
          <label className="text-xs font-semibold text-slate-600">ステータス<select name="decision" defaultValue={row.match_status} className={input}><option value="pending">保留</option><option value="matched_existing">既存店舗へ紐づけ</option><option value="ready_to_create">新規店舗を作成</option><option value="rejected">除外</option></select></label>
          <label className="text-xs font-semibold text-slate-600">不確定の理由・修正メモ<textarea name="match_reason" defaultValue={row.match_reason ?? ""} placeholder="例：店名は一致するが支店住所が不明。公式HPで確認が必要。" rows={3} className={input} /></label>
          <button disabled={saving} className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60">{saving ? "公式サイトを読み取り中…(最大1分)" : "ステータスを保存"}</button>
        </form>
        </details>
        {shopLabel && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">対象店舗: {shopLabel}</p>}
        {row.match_status === "ready_to_create" && !row.matched_shop_id && <form action={createDraft} className="grid gap-3 rounded-lg bg-amber-50 p-4"><p className="text-sm font-semibold text-amber-900">店名と住所が分かれば店舗を登録(公式HPは任意)</p><input type="hidden" name="portal_id" value={row.portal_id} /><input name="name" defaultValue={row.candidate_name ?? ""} placeholder="店名" required className={input}/><input name="address" defaultValue={row.candidate_address ?? ""} placeholder="住所" required className={input}/><input name="official_url" type="url" defaultValue={row.official_url ?? ""} placeholder="https:// 公式サイト(任意)" className={input}/><select name="category" defaultValue={row.portal_id === 408 ? "美容・暮らし" : "カフェ・スイーツ"} className={input}>{["カフェ・スイーツ", "レストラン・食事", "居酒屋・バー", "ショッピング", "観光・体験", "宿泊", "ペット", "美容・暮らし", "その他"].map((category) => <option key={category}>{category}</option>)}</select><label className="flex items-center gap-2 text-sm text-amber-900"><input type="checkbox" name="publish" value="1" defaultChecked />すぐ公開する(地図・リールに表示)</label><button className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white">店舗を登録</button></form>}
        {row.matched_shop_id && !row.reel_id && <form action={publish}><button className="w-full rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">この店舗IDでリールを投稿</button></form>}
        {row.reel_id && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">公開済み（リール投稿済み）</p>}
      </div>
    </article>
  );
}
