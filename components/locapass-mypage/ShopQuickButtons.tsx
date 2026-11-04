"use client";

import { useRef, useState } from "react";
import Link from "@/components/i18n/LocaleLink";
import { Camera, MessageCircle, SlidersHorizontal } from "lucide-react";
import { STATUS_LABEL, fileToBase64 } from "@/components/locapass-dashboard/FloorStatusDropzone";

/**
 * マイページの店舗ごとのショートカット: 空席の更新(撮影→AI判定)・お問い合わせ(未対応の件数)・店舗管理。
 * 親指で押せる大きさのボタンを、投稿ボタンのすぐ下に並べる。
 */
export function ShopQuickButtons({
  shopId,
  initialStatusText,
  openInquiries,
}: {
  shopId: string;
  initialStatusText: string | null;
  openInquiries: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [statusText, setStatusText] = useState(initialStatusText);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const imageBase64 = await fileToBase64(file);
      const res = await fetch("/api/admin/locapass-shop-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId, imageBase64, mimeType: file.type || "image/jpeg" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "判定に失敗しました");
      const time = new Date(data.occupancyStatus.captured_at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
      setStatusText(`${STATUS_LABEL[data.occupancyStatus.status] ?? data.occupancyStatus.status}(${time})`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "判定に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  const btn =
    "relative flex min-h-[64px] flex-col items-center justify-center gap-0.5 rounded-xl border border-main/20 bg-tone-800 px-2 py-2 text-center text-main active:scale-95";

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-3 gap-2">
        <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className={`${btn} disabled:opacity-60`}>
          <Camera size={20} className="text-rose-400" />
          <span className="text-xs font-bold">{busy ? "AI判定中…" : "空席を更新"}</span>
          <span className="line-clamp-1 text-[10px] text-muted">{statusText ?? "フロアを撮影"}</span>
        </button>
        <Link href={`/dashboard/shop/${shopId}/inquiries`} className={btn}>
          <MessageCircle size={20} className="text-emerald-400" />
          <span className="text-xs font-bold">お問い合わせ</span>
          <span className="text-[10px] text-muted">{openInquiries > 0 ? `未対応 ${openInquiries}件` : "未対応なし"}</span>
          {openInquiries > 0 && (
            <span className="absolute right-1.5 top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
              {openInquiries}
            </span>
          )}
        </Link>
        <Link href={`/dashboard/shop/${shopId}`} className={btn}>
          <SlidersHorizontal size={20} className="text-sky-400" />
          <span className="text-xs font-bold">店舗管理</span>
          <span className="text-[10px] text-muted">すべての設定</span>
        </Link>
      </div>
      {/* captureは付けない(カメラ固定だとギャラリーが選べない端末があるため)。 */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {error && <p className="text-[11px] font-semibold text-red-400">{error}</p>}
    </div>
  );
}
